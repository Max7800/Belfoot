"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, LockKeyhole, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  DEFAULT_IMPORT_PLAN,
  IMPORT_GROUPS,
  IMPORT_SCOPES,
  hydrateCompetitionConfig,
  hydrateNationalConfig,
  importPlanEstimate,
  importPlanSchedule,
  normalizeImportPlan,
} from "@/lib/importPlan";

const groupLabel = Object.fromEntries(IMPORT_GROUPS.map((group) => [group.key, group.label]));
const scopeOptions = Object.entries(IMPORT_SCOPES);

function SeasonTarget({ value, onChange, disabled }) {
  return <div className={`rounded-lg border p-2 ${value?.enabled && !disabled ? "border-accent/25 bg-accent/5" : "border-line/10 bg-bg/30 opacity-60"}`}>
    <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted"><input type="checkbox" checked={!!value?.enabled && !disabled} disabled={disabled} onChange={(event) => onChange({ enabled: event.target.checked })} />Importer</label>
    <select value={value?.scope || "complete"} disabled={disabled || !value?.enabled} onChange={(event) => onChange({ scope: event.target.value })} className="mt-2 w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-[11px] text-content disabled:opacity-50">{scopeOptions.map(([key, scope]) => <option key={key} value={key}>{scope.label}</option>)}</select>
  </div>;
}

export default function ImportPlanPanel() {
  const [competitions, setCompetitions] = useState([]);
  const [nationalTeams, setNationalTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [plan, setPlan] = useState(DEFAULT_IMPORT_PLAN);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  const load = async () => {
    setStatus("loading"); setMessage("");
    const [competitionResult, nationalResult, settingsResult, seasonResult] = await Promise.all([
      supabase.from("competitions").select("id,name,external_id,provider,public_visible").not("provider", "is", null).order("name"),
      supabase.from("clubs").select("id,name,external_id,national_category,national_gender").eq("team_type", "national").eq("national_followed", true).order("name"),
      supabase.from("site_settings").select("data").eq("id", 1).maybeSingle(),
      supabase.from("seasons").select("id,label,competition_id,import_status,public_active,activated_at").order("label", { ascending: false }),
    ]);
    const error = competitionResult.error || nationalResult.error || settingsResult.error || seasonResult.error;
    if (error) { setStatus("error"); setMessage(error.message); return; }
    const competitionRows = competitionResult.data || [];
    const nationalRows = nationalResult.data || [];
    const stored = normalizeImportPlan(settingsResult.data?.data?.football_import_plan);
    setCompetitions(competitionRows);
    setNationalTeams(nationalRows);
    setSeasons(seasonResult.data || []);
    setPlan({
      ...stored,
      version: 2,
      competitions: Object.fromEntries(competitionRows.map((competition, index) => [competition.id, hydrateCompetitionConfig(competition, stored.competitions[competition.id], index)])),
      nationalTeams: Object.fromEntries(nationalRows.filter((team) => team.external_id).map((team, index) => [String(team.external_id), hydrateNationalConfig(stored.nationalTeams[String(team.external_id)], index)])),
    });
    setStatus("idle");
  };

  useEffect(() => { load(); }, []);

  const updateCompetition = (id, patch) => setPlan((current) => ({ ...current, competitions: { ...current.competitions, [id]: { ...current.competitions[id], ...patch } } }));
  const updateCompetitionSeason = (id, season, patch) => setPlan((current) => ({ ...current, competitions: { ...current.competitions, [id]: { ...current.competitions[id], seasons: { ...current.competitions[id].seasons, [season]: { ...current.competitions[id].seasons[season], ...patch } } } } }));
  const updateNational = (id, patch) => setPlan((current) => ({ ...current, nationalTeams: { ...current.nationalTeams, [id]: { ...current.nationalTeams[id], ...patch } } }));
  const updateNationalSeason = (id, season, patch) => setPlan((current) => ({ ...current, nationalTeams: { ...current.nationalTeams, [id]: { ...current.nationalTeams[id], seasons: { ...current.nationalTeams[id].seasons, [season]: { ...current.nationalTeams[id].seasons[season], ...patch } } } } }));
  const updateSeason = (label, patch) => setPlan((current) => ({ ...current, seasons: current.seasons.map((season) => season.label === label ? { ...season, ...patch } : season) }));

  const save = async () => {
    setStatus("saving"); setMessage("");
    const { data } = await supabase.from("site_settings").select("data").eq("id", 1).maybeSingle();
    const storedPlan = { ...plan, version: 2 };
    delete storedPlan.legacySeason;
    const { error } = await supabase.from("site_settings").update({ data: { ...(data?.data || {}), football_import_plan: storedPlan } }).eq("id", 1);
    setStatus(error ? "error" : "saved");
    setMessage(error?.message || "Plan historique et whitelist enregistrés. Aucun appel API n’a été lancé.");
  };
  const markReady = async (season) => {
    setStatus("saving"); setMessage("");
    const { error } = await supabase.from("seasons").update({ import_status: "ready" }).eq("id", season.id).eq("public_active", false);
    if (error) { setStatus("error"); setMessage(error.message); return; }
    await load(); setMessage(`${season.label} est prête, mais pas encore la saison par défaut.`);
  };
  const activate = async (season) => {
    if (!window.confirm(`Activer ${season.label} sur le site public ?\n\nLes autres saisons resteront consultables.`)) return;
    setStatus("saving"); setMessage("");
    const { error } = await supabase.rpc("activate_competition_season", { target_season: season.id });
    if (error) { setStatus("error"); setMessage(error.message); return; }
    await load(); setMessage(`${season.label} est maintenant la saison proposée par défaut.`);
  };

  const estimate = useMemo(() => importPlanEstimate(plan), [plan]);
  const schedule = useMemo(() => importPlanSchedule(plan, competitions, nationalTeams), [plan, competitions, nationalTeams]);
  const competitionName = Object.fromEntries(competitions.map((competition) => [competition.id, competition.name]));

  return <div>
    <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Mois API-Football Pro</p><h1 className="mt-1 text-2xl font-black">Plan historique 2024 → 2027</h1><p className="mt-1 max-w-3xl text-sm text-muted">Trois saisons séparées, une whitelist par compétition et un quota quotidien. Enregistrer ne lance aucun import et n’active jamais 2026 automatiquement.</p></div><button type="button" onClick={load} disabled={["loading", "saving"].includes(status)} className="rounded-xl border border-line/15 bg-surface p-2 text-muted hover:text-white disabled:opacity-50" title="Actualiser"><RefreshCw className={`h-4 w-4 ${status === "loading" ? "animate-spin" : ""}`} /></button></div>

    {message && <div className={`mb-5 rounded-xl border p-3 text-sm ${status === "error" ? "border-red-400/25 bg-red-500/10 text-red-200" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"}`}>{message}</div>}

    <section className="mb-6 rounded-2xl border border-line/10 bg-surface p-4">
      <div className="grid gap-3 md:grid-cols-3">{plan.seasons.map((season) => <label key={season.label} className={`rounded-xl border p-3 ${season.enabled ? "border-accent/25 bg-accent/5" : "border-line/10 opacity-60"}`}><span className="flex items-center justify-between gap-2"><b>{season.label}</b><input type="checkbox" checked={season.enabled} onChange={(event) => updateSeason(season.label, { enabled: event.target.checked })} /></span><span className="mt-1 block text-[11px] text-muted">{season.role === "rollout" ? "Saison à activer progressivement" : "Archive conservée et consultable"}</span><strong className="mt-3 block text-xl">≈ {estimate.bySeason[season.label] || 0}</strong><span className="text-[10px] text-muted">appels planifiés</span></label>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
        ["apiBudget", "Quota quotidien", 1], ["careerReserve", "Réserve carrières / jour", 0], ["liveReserve", "Réserve direct / jour", 0],
      ].map(([key, label, min]) => <label key={key} className="text-xs text-muted">{label}<input type="number" min={min} max="50000" value={plan[key]} onChange={(event) => setPlan((current) => ({ ...current, [key]: Math.max(min, Number(event.target.value) || 0) }))} className="mt-1 block w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm text-content" /></label>)}<div className="rounded-xl border border-line/10 bg-bg/35 p-3"><b className="block text-xl">{estimate.imports}</b><span className="text-[10px] text-muted">appels historiques estimés</span></div><div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3"><b className="block text-xl text-emerald-300">{schedule.days.length}</b><span className="text-[10px] text-muted">journée{schedule.days.length > 1 ? "s" : ""} d’import prévue{schedule.days.length > 1 ? "s" : ""}</span></div></div>
      <p className="mt-3 text-[11px] leading-5 text-muted">Capacité quotidienne réservée aux imports historiques : {estimate.usableDaily} appels après {estimate.reserved} appels gardés pour les carrières et le direct. Projection haute : calendrier = 3 appels par compétition ; effectifs = jusqu’à 3 pages par club + entraîneur ; complet = jusqu’à 3 appels par match. Le préflight recalculera le coût réel avant chaque lancement.</p>
    </section>

    <section className="mb-6 rounded-2xl border border-line/10 bg-surface p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">Compétitions</h2><p className="text-xs text-muted">Les estimations clubs/matchs sont modifiables avant l’abonnement.</p></div><button type="button" onClick={save} disabled={status === "saving" || schedule.capacity <= 0 || schedule.oversized.length > 0} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{status === "saving" ? "Enregistrement…" : "Enregistrer le plan"}</button></div>
      <div className="space-y-3">{competitions.map((competition) => { const config = plan.competitions[competition.id]; if (!config) return null; return <article key={competition.id} className="rounded-xl border border-line/10 bg-bg/30 p-3"><div className="grid gap-3 lg:grid-cols-[auto_minmax(180px,1fr)_180px_80px_100px_100px] lg:items-center"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={config.enabled} onChange={(event) => updateCompetition(competition.id, { enabled: event.target.checked })} />Autoriser</label><div><b className="block text-sm">{competition.name}</b><span className="text-[10px] text-muted">{competition.provider} · ID {competition.external_id}</span></div><select value={config.group} onChange={(event) => updateCompetition(competition.id, { group: event.target.value })} className="rounded-lg border border-line/10 bg-surface2 px-2 py-2 text-xs">{IMPORT_GROUPS.filter((group) => group.key !== "national").map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}</select><label className="text-[10px] uppercase text-muted">Ordre<input type="number" min="1" value={config.order} onChange={(event) => updateCompetition(competition.id, { order: Number(event.target.value) || 999 })} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-sm text-content" /></label><label className="text-[10px] uppercase text-muted">Clubs prévus<input type="number" min="0" value={config.expected_clubs} onChange={(event) => updateCompetition(competition.id, { expected_clubs: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-sm text-content" /></label><label className="text-[10px] uppercase text-muted">Matchs prévus<input type="number" min="0" value={config.expected_matches} onChange={(event) => updateCompetition(competition.id, { expected_matches: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-sm text-content" /></label></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{plan.seasons.map((season) => <div key={season.label}><div className="mb-1 text-[10px] font-black text-muted">{season.label}</div><SeasonTarget value={config.seasons[season.label]} disabled={!config.enabled || !season.enabled} onChange={(patch) => updateCompetitionSeason(competition.id, season.label, patch)} /></div>)}</div></article>; })}</div>
    </section>

    {nationalTeams.length > 0 && <section className="mb-6 rounded-2xl border border-line/10 bg-surface p-4"><h2 className="mb-3 font-black">Sélections belges</h2><div className="space-y-3">{nationalTeams.map((team, index) => { const externalId = String(team.external_id || ""); const config = plan.nationalTeams[externalId] || hydrateNationalConfig({}, index); return <article key={team.id} className="rounded-xl border border-line/10 bg-bg/30 p-3"><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={config.enabled} disabled={!externalId} onChange={(event) => updateNational(externalId, { enabled: event.target.checked })} />Autoriser</label><div className="min-w-[180px] flex-1"><b className="block text-sm">{team.name}</b><span className="text-[10px] text-muted">ID équipe {externalId || "manquant"}</span></div><label className="text-[10px] uppercase text-muted">Ordre<input type="number" min="1" value={config.order} onChange={(event) => updateNational(externalId, { order: Number(event.target.value) || 999 })} className="mt-1 w-20 rounded border border-line/10 bg-surface2 px-2 py-1 text-sm text-content" /></label><label className="text-[10px] uppercase text-muted">Matchs/saison<input type="number" min="0" value={config.expected_matches} onChange={(event) => updateNational(externalId, { expected_matches: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-24 rounded border border-line/10 bg-surface2 px-2 py-1 text-sm text-content" /></label></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{plan.seasons.map((season) => <div key={season.label}><div className="mb-1 text-[10px] font-black text-muted">{season.label}</div><SeasonTarget value={config.seasons[season.label]} disabled={!config.enabled || !season.enabled} onChange={(patch) => updateNationalSeason(externalId, season.label, patch)} /></div>)}</div></article>; })}</div></section>}

    <section className="mb-6 rounded-2xl border border-accent/20 bg-accent/5 p-4"><h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-accent"><LockKeyhole className="h-4 w-4" />Ordre quotidien autorisé</h2>{schedule.days.length ? <div className="space-y-4">{schedule.days.map((day) => <div key={day.day}><h3 className="mb-2 text-xs font-black">Jour {day.day} · ≈ {day.cost} / {schedule.capacity} appels d’import</h3><ol className="space-y-1.5">{day.targets.map((target, index) => <li key={`${target.type}-${target.id}-${target.season}`} className="flex items-center gap-3 rounded-lg border border-line/10 bg-surface px-3 py-2 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-xs font-black text-accent">{index + 1}</span><span className="flex-1 font-bold">{target.season} · {target.label}</span><span className="text-[10px] uppercase text-muted">≈ {target.cost} · {IMPORT_SCOPES[target.scope]?.label} · {groupLabel[target.group] || target.group}</span></li>)}</ol></div>)}</div> : <p className="text-sm text-muted">Aucune cible autorisée. Tous les imports seront bloqués après enregistrement.</p>}{schedule.capacity <= 0 && <div className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-200">Les réserves carrières et direct utilisent tout le quota quotidien. Réduis-les avant d’enregistrer.</div>}{schedule.oversized.length > 0 && <div className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-200">Une cible dépasse à elle seule la capacité quotidienne : {schedule.oversized.map((target) => `${target.season} · ${target.label} (≈ ${target.cost})`).join(", ")}. Réduis son périmètre ou augmente le quota avant d’enregistrer.</div>}</section>

    <section><div className="mb-3"><h2 className="text-lg font-black">Activation publique des saisons</h2><p className="mt-1 text-xs text-muted">Une archive prête reste consultable. Une seule saison est proposée par défaut pour chaque compétition.</p></div><div className="divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/10 bg-surface">{seasons.map((season) => <div key={season.id} className="flex flex-wrap items-center gap-3 p-3 text-sm"><div className="min-w-[190px] flex-1"><b>{competitionName[season.competition_id] || "Compétition"} · {season.label}</b><div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{season.import_status || "inconnu"}</div></div>{season.public_active ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Par défaut</span> : <>{["draft", "error", "importing"].includes(season.import_status) && <button type="button" onClick={() => markReady(season)} disabled={status === "saving"} className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200 disabled:opacity-50">Marquer prête</button>}{season.import_status === "ready" && <button type="button" onClick={() => activate(season)} disabled={status === "saving"} className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200 disabled:opacity-50">Utiliser par défaut</button>}</>}</div>)}</div></section>
    <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Les projections sont volontairement hautes et réparties sur plusieurs journées si nécessaire. Le préflight basé sur les données déjà importées donnera le coût précis avant chaque pipeline.</p></div>
  </div>;
}
