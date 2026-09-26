"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, LockKeyhole, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { DEFAULT_IMPORT_PLAN, IMPORT_GROUPS, normalizeImportPlan, orderedImportTargets, suggestedGroup } from "@/lib/importPlan";

const groupLabel = Object.fromEntries(IMPORT_GROUPS.map((group) => [group.key, group.label]));

function defaultCompetitionConfig(competition, index) {
  const group = suggestedGroup(competition);
  return { enabled: group !== "foreign", group, order: (index + 1) * 10 };
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
    if (error) { setStatus("error"); setMessage(error.message.includes("import_status") ? "Applique d’abord la migration football/0032_season_rollout.sql." : error.message); return; }
    const competitionRows = competitionResult.data || [];
    const nationalRows = nationalResult.data || [];
    const stored = normalizeImportPlan(settingsResult.data?.data?.football_import_plan);
    const competitionsConfig = { ...stored.competitions };
    competitionRows.forEach((competition, index) => {
      if (!competitionsConfig[competition.id]) competitionsConfig[competition.id] = defaultCompetitionConfig(competition, index);
    });
    const nationalConfig = { ...stored.nationalTeams };
    nationalRows.forEach((team, index) => {
      const externalId = String(team.external_id || "");
      if (externalId && !nationalConfig[externalId]) nationalConfig[externalId] = { enabled: true, order: (index + 1) * 10 };
    });
    setCompetitions(competitionRows); setNationalTeams(nationalRows); setSeasons(seasonResult.data || []);
    setPlan({ ...stored, competitions: competitionsConfig, nationalTeams: nationalConfig });
    setStatus("idle");
  };

  useEffect(() => { load(); }, []);

  const updateCompetition = (id, patch) => setPlan((current) => ({ ...current, competitions: { ...current.competitions, [id]: { ...(current.competitions[id] || {}), ...patch } } }));
  const updateNational = (externalId, patch) => setPlan((current) => ({ ...current, nationalTeams: { ...current.nationalTeams, [externalId]: { ...(current.nationalTeams[externalId] || {}), ...patch } } }));
  const save = async () => {
    setStatus("saving"); setMessage("");
    const { data } = await supabase.from("site_settings").select("data").eq("id", 1).maybeSingle();
    const { error } = await supabase.from("site_settings").update({ data: { ...(data?.data || {}), football_import_plan: plan } }).eq("id", 1);
    setStatus(error ? "error" : "saved"); setMessage(error?.message || "Plan et whitelist enregistrés.");
  };
  const markReady = async (season) => {
    setStatus("saving"); setMessage("");
    const { error } = await supabase.from("seasons").update({ import_status: "ready" }).eq("id", season.id).eq("public_active", false);
    if (error) { setStatus("error"); setMessage(error.message); return; }
    await load(); setMessage(`${season.label} est prête, mais pas encore publique.`);
  };
  const activate = async (season) => {
    if (!window.confirm(`Activer ${season.label} sur le site public ?\n\nL’ancienne saison restera disponible dans le sélecteur.`)) return;
    setStatus("saving"); setMessage("");
    const { error } = await supabase.rpc("activate_competition_season", { target_season: season.id });
    if (error) { setStatus("error"); setMessage(error.message); return; }
    await load(); setMessage(`${season.label} est maintenant la saison publique par défaut.`);
  };

  const orderedTargets = useMemo(() => orderedImportTargets(plan, competitions, nationalTeams), [plan, competitions, nationalTeams]);
  const competitionName = Object.fromEntries(competitions.map((competition) => [competition.id, competition.name]));

  return <div>
    <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Mois API-Football Pro</p><h1 className="mt-1 text-2xl font-black">Plan d’import 2026</h1><p className="mt-1 max-w-3xl text-sm text-muted">Cette whitelist est la seule autorisation de synchroniser 2026. Enregistrer le plan ne lance aucun appel API et n’active aucune saison publiquement.</p></div><button type="button" onClick={load} disabled={status === "loading" || status === "saving"} className="rounded-xl border border-line/15 bg-surface p-2 text-muted hover:text-white disabled:opacity-50" title="Actualiser"><RefreshCw className={`h-4 w-4 ${status === "loading" ? "animate-spin" : ""}`} /></button></div>

    {message && <div className={`mb-5 rounded-xl border p-3 text-sm ${status === "error" ? "border-red-400/25 bg-red-500/10 text-red-200" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"}`}>{message}</div>}
    {status === "error" && !competitions.length ? null : <>
      <section className="mb-6 rounded-2xl border border-line/10 bg-surface p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><label className="text-xs font-bold uppercase tracking-wider text-muted">Saison du plan<input value={plan.season} onChange={(event) => setPlan((current) => ({ ...current, season: event.target.value }))} className="mt-1 block w-36 rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm normal-case tracking-normal text-content" /></label><button type="button" onClick={save} disabled={status === "saving"} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{status === "saving" ? "Enregistrement…" : "Enregistrer la whitelist"}</button></div>
        <div className="space-y-2">{competitions.map((competition) => { const config = plan.competitions[competition.id] || defaultCompetitionConfig(competition, 0); return <div key={competition.id} className="grid gap-2 rounded-xl border border-line/10 bg-bg/35 p-3 sm:grid-cols-[auto_minmax(180px,1fr)_210px_90px] sm:items-center"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={!!config.enabled} onChange={(event) => updateCompetition(competition.id, { enabled: event.target.checked })} />Autoriser</label><div><b className="block text-sm">{competition.name}</b><span className="text-[10px] text-muted">{competition.provider} · ID {competition.external_id}</span></div><select value={config.group || suggestedGroup(competition)} onChange={(event) => updateCompetition(competition.id, { group: event.target.value })} className="rounded-lg border border-line/10 bg-surface2 px-2 py-2 text-xs">{IMPORT_GROUPS.filter((group) => group.key !== "national").map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}</select><label className="text-[10px] uppercase text-muted">Ordre<input type="number" min="1" value={config.order || 999} onChange={(event) => updateCompetition(competition.id, { order: Number(event.target.value) || 999 })} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-sm text-content" /></label></div>; })}</div>
        {nationalTeams.length > 0 && <div className="mt-5 border-t border-line/10 pt-4"><h2 className="mb-2 text-xs font-black uppercase tracking-wider text-muted">Sélections belges</h2><div className="space-y-2">{nationalTeams.map((team, index) => { const externalId = String(team.external_id || ""); const config = plan.nationalTeams[externalId] || { enabled: true, order: (index + 1) * 10 }; return <div key={team.id} className="grid gap-2 rounded-xl border border-line/10 bg-bg/35 p-3 sm:grid-cols-[auto_minmax(180px,1fr)_90px] sm:items-center"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={!!config.enabled} disabled={!externalId} onChange={(event) => updateNational(externalId, { enabled: event.target.checked })} />Autoriser</label><div><b className="block text-sm">{team.name}</b><span className="text-[10px] text-muted">ID équipe {externalId || "manquant"}</span></div><label className="text-[10px] uppercase text-muted">Ordre<input type="number" min="1" value={config.order || 999} onChange={(event) => updateNational(externalId, { order: Number(event.target.value) || 999 })} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-sm text-content" /></label></div>; })}</div></div>}
      </section>

      <section className="mb-6 rounded-2xl border border-accent/20 bg-accent/5 p-4"><h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-accent"><LockKeyhole className="h-4 w-4" />Ordre autorisé</h2>{orderedTargets.length ? <ol className="space-y-2">{orderedTargets.map((target, index) => <li key={`${target.type}-${target.id}`} className="flex items-center gap-3 rounded-lg border border-line/10 bg-surface px-3 py-2 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-xs font-black text-accent">{index + 1}</span><span className="flex-1 font-bold">{target.label}</span><span className="text-[10px] uppercase text-muted">{groupLabel[target.group] || target.group}</span></li>)}</ol> : <p className="text-sm text-muted">Aucune cible autorisée. Tous les imports 2026 seront bloqués.</p>}</section>

      <section><div className="mb-3"><h2 className="text-lg font-black">Activation publique des saisons</h2><p className="mt-1 text-xs text-muted">Une saison importée reste invisible par défaut. Passe-la d’abord à « prête », puis active-la explicitement après contrôle.</p></div><div className="divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/10 bg-surface">{seasons.map((season) => <div key={season.id} className="flex flex-wrap items-center gap-3 p-3 text-sm"><div className="min-w-[190px] flex-1"><b>{competitionName[season.competition_id] || "Compétition"} · {season.label}</b><div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{season.import_status || "inconnu"}</div></div>{season.public_active ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Publique</span> : <>{["draft", "error", "importing"].includes(season.import_status) && <button type="button" onClick={() => markReady(season)} disabled={status === "saving"} className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200 disabled:opacity-50">Marquer prête</button>}{season.import_status === "ready" && <button type="button" onClick={() => activate(season)} disabled={status === "saving"} className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200 disabled:opacity-50">Activer publiquement</button>}</>}</div>)}</div>
      </section>
      <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>L’activation publique ne supprime jamais 2024. Elle change uniquement la saison proposée par défaut ; les anciennes saisons restent disponibles dans les sélecteurs.</p></div>
    </>}
  </div>;
}
