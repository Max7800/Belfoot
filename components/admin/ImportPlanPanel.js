"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, LockKeyhole, RefreshCw, Search } from "lucide-react";
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
import { COMPETITION_SCOPES, groupCompetitionsByScope, resolveCompetitionScope, competitionCountry } from "@/lib/competitionScopes";

const groupLabel = Object.fromEntries(IMPORT_GROUPS.map((group) => [group.key, group.label]));
const scopeOptions = Object.entries(IMPORT_SCOPES);
// Catégories du plan = taxonomie partagée avec le sélecteur de sync (Belgique / Europe /
// Étranger par pays / Sélections). La catégorie « Sélections » (international) porte aussi
// les sélections nationales suivies.
const PLAN_CATEGORIES = COMPETITION_SCOPES;

// Certains anciens imports ont créé une ligne éditoriale puis une ligne API
// pour le même provider/id. Elles doivent être consolidées en base plus tard,
// mais le plan ne peut jamais les proposer deux fois entre-temps.
function distinctProviderCompetitions(rows, seasons = []) {
  const grouped = new Map();
  for (const competition of rows) {
    const key = competition.provider && competition.external_id ? `${competition.provider}:${competition.external_id}` : competition.id;
    const current = grouped.get(key);
    const score = seasons.filter((season) => season.competition_id === competition.id).length * 100
      + (competition.public_visible !== false ? 10 : 0)
      + (/^(jupiler|uefa)/i.test(competition.name || "") ? 1 : 0);
    if (!current || score > current.score) grouped.set(key, { competition, score });
  }
  return [...grouped.values()].map((entry) => entry.competition);
}

async function requestReadiness(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session administrateur expirée.");
  const response = await fetch("/api/admin/season-readiness", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || "Le contrôle de préparation a échoué.");
    error.report = result.report;
    throw error;
  }
  return result;
}

async function requestMaintenance(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session administrateur expirée.");
  const response = await fetch("/api/admin/data-maintenance", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "L’analyse des données a échoué.");
  return result;
}

function SeasonTarget({ value, onChange, disabled, national = false }) {
  return <div className={`rounded-lg border p-2 ${value?.enabled && !disabled ? "border-accent/25 bg-accent/5" : "border-line/10 bg-bg/30 opacity-60"}`}>
    <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted"><input type="checkbox" checked={!!value?.enabled && !disabled} disabled={disabled} onChange={(event) => onChange({ enabled: event.target.checked })} />Importer</label>
    <select value={value?.scope || "complete"} disabled={disabled || !value?.enabled} onChange={(event) => onChange({ scope: event.target.value })} className="mt-2 w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-[11px] text-content disabled:opacity-50">{scopeOptions.map(([key, scope]) => <option key={key} value={key}>{scope.label}</option>)}</select>
    <div className={`mt-2 grid gap-2 ${national ? "grid-cols-1" : "grid-cols-2"}`}>
      {!national && <label className="text-[9px] uppercase text-muted">Clubs<input type="number" min="0" value={value?.expected_clubs ?? 0} disabled={disabled || !value?.enabled} onChange={(event) => onChange({ expected_clubs: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-[11px] text-content disabled:opacity-50" /></label>}
      <label className="text-[9px] uppercase text-muted">Matchs<input type="number" min="0" value={value?.expected_matches ?? 0} disabled={disabled || !value?.enabled} onChange={(event) => onChange({ expected_matches: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-[11px] text-content disabled:opacity-50" /></label>
    </div>
  </div>;
}

export default function ImportPlanPanel() {
  const [competitions, setCompetitions] = useState([]);
  const [nationalTeams, setNationalTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [readiness, setReadiness] = useState({});
  const [plan, setPlan] = useState(DEFAULT_IMPORT_PLAN);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [maintenanceSeasonId, setMaintenanceSeasonId] = useState("");
  const [maintenanceReport, setMaintenanceReport] = useState(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState("idle");
  const [maintenanceCoverage, setMaintenanceCoverage] = useState({});
  const [purgePreview, setPurgePreview] = useState(null);
  const [purgeConfirmation, setPurgeConfirmation] = useState("");
  const [duplicateAudit, setDuplicateAudit] = useState(null);
  const [duplicateAuditStatus, setDuplicateAuditStatus] = useState("idle");
  const [activationSeason, setActivationSeason] = useState("all");

  const load = useCallback(async () => {
    setStatus("loading"); setMessage("");
    const [competitionResult, nationalResult, settingsResult, seasonResult] = await Promise.all([
      supabase.from("competitions").select("id,name,external_id,provider,public_visible,competition_scope").not("provider", "is", null).order("name"),
      supabase.from("clubs").select("id,name,external_id,national_category,national_gender").eq("team_type", "national").eq("national_followed", true).order("name"),
      supabase.from("site_settings").select("data").eq("id", 1).maybeSingle(),
      supabase.from("seasons").select("id,label,competition_id,import_status,public_active,activated_at").order("label", { ascending: false }),
    ]);
    const error = competitionResult.error || nationalResult.error || settingsResult.error || seasonResult.error;
    if (error) { setStatus("error"); setMessage(error.message); return; }
    const rawCompetitionRows = competitionResult.data || [];
    const nationalRows = nationalResult.data || [];
    const stored = normalizeImportPlan(settingsResult.data?.data?.football_import_plan);
    const resetArchiveScopes = stored.version < 3;
    const resetSeasonEstimates = stored.version < 4;
    const competitionRows = distinctProviderCompetitions(rawCompetitionRows, seasonResult.data || []);
    setCompetitions(competitionRows);
    setNationalTeams(nationalRows);
    const seasonRows = seasonResult.data || [];
    setSeasons(seasonRows);
    setMaintenanceSeasonId((current) => current && seasonRows.some((season) => season.id === current) ? current : seasonRows[0]?.id || "");
    setPlan({
      ...stored,
      version: 4,
      competitions: Object.fromEntries(competitionRows.map((competition, index) => [competition.id, hydrateCompetitionConfig(competition, stored.competitions[competition.id], index, { resetArchiveScopes, resetSeasonEstimates })])),
      nationalTeams: Object.fromEntries(nationalRows.filter((team) => team.external_id).map((team, index) => [String(team.external_id), hydrateNationalConfig(stored.nationalTeams[String(team.external_id)], index, { resetArchiveScopes })])),
    });
    const hiddenDuplicates = rawCompetitionRows.length - competitionRows.length;
    if (resetArchiveScopes || resetSeasonEstimates || hiddenDuplicates) setMessage(`${resetArchiveScopes || resetSeasonEstimates ? "Plan adapté : périmètre et nombres de clubs/matchs sont maintenant définis saison par saison." : ""}${hiddenDuplicates ? `${resetArchiveScopes || resetSeasonEstimates ? " " : ""}${hiddenDuplicates} doublon(s) provider sont masqués du plan ; aucune donnée ni saison n’est supprimée.` : ""} Enregistre pour confirmer.`);
    try {
      const result = seasonRows.length ? await requestReadiness({ seasonIds: seasonRows.map((season) => season.id) }) : { reports: [] };
      setReadiness(Object.fromEntries((result.reports || []).map((report) => [report.season.id, report])));
      setStatus("idle");
    } catch (readinessError) {
      setReadiness({});
      setStatus("error");
      setMessage(`Plan chargé, mais contrôle des saisons indisponible : ${readinessError.message}`);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateCompetition = (id, patch) => setPlan((current) => ({ ...current, competitions: { ...current.competitions, [id]: { ...current.competitions[id], ...patch } } }));
  const updateCompetitionSeason = (id, season, patch) => setPlan((current) => ({ ...current, competitions: { ...current.competitions, [id]: { ...current.competitions[id], seasons: { ...current.competitions[id].seasons, [season]: { ...current.competitions[id].seasons[season], ...patch } } } } }));
  const updateNational = (id, patch) => setPlan((current) => ({ ...current, nationalTeams: { ...current.nationalTeams, [id]: { ...current.nationalTeams[id], ...patch } } }));
  const updateNationalSeason = (id, season, patch) => setPlan((current) => ({ ...current, nationalTeams: { ...current.nationalTeams, [id]: { ...current.nationalTeams[id], seasons: { ...current.nationalTeams[id].seasons, [season]: { ...current.nationalTeams[id].seasons[season], ...patch } } } } }));
  const updateSeason = (label, patch) => setPlan((current) => ({ ...current, seasons: current.seasons.map((season) => season.label === label ? { ...season, ...patch } : season) }));

  // Carte d'une compétition (case Autoriser + groupe d'ordre + saisons). Réutilisée
  // dans chaque catégorie ET dans les sous-groupes par pays de « Étranger ».
  const renderCompetitionArticle = (competition) => {
    const config = plan.competitions[competition.id];
    if (!config) return null;
    return <article key={competition.id} className="rounded-xl border border-line/10 bg-surface/70 p-3"><div className="grid gap-3 lg:grid-cols-[auto_minmax(180px,1fr)_180px_80px] lg:items-center"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={config.enabled} onChange={(event) => updateCompetition(competition.id, { enabled: event.target.checked })} />Autoriser</label><div><b className="block text-sm">{competition.name}</b><span className="text-[10px] text-muted">{competition.provider} · ID {competition.external_id}{competition.ext?.country ? ` · ${competition.ext.country}` : ""}</span></div><select value={config.group} onChange={(event) => updateCompetition(competition.id, { group: event.target.value })} className="rounded-lg border border-line/10 bg-surface2 px-2 py-2 text-xs">{IMPORT_GROUPS.filter((group) => group.key !== "national").map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}</select><label className="text-[10px] uppercase text-muted">Ordre<input type="number" min="1" value={config.order} onChange={(event) => updateCompetition(competition.id, { order: Number(event.target.value) || 999 })} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-sm text-content" /></label></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{plan.seasons.map((season) => <div key={season.label}><div className="mb-1 text-[10px] font-black text-muted">{season.label}</div><SeasonTarget value={config.seasons[season.label]} disabled={!config.enabled || !season.enabled} onChange={(patch) => updateCompetitionSeason(competition.id, season.label, patch)} /></div>)}</div></article>;
  };

  const save = async () => {
    setStatus("saving"); setMessage("");
    const { data } = await supabase.from("site_settings").select("data").eq("id", 1).maybeSingle();
    const storedPlan = { ...plan, version: 4 };
    delete storedPlan.legacySeason;
    const { error } = await supabase.from("site_settings").update({ data: { ...(data?.data || {}), football_import_plan: storedPlan } }).eq("id", 1);
    setStatus(error ? "error" : "saved");
    setMessage(error?.message || "Plan historique et whitelist enregistrés. Aucun appel API n’a été lancé.");
  };
  const markReady = async (season) => {
    setStatus("saving"); setMessage("");
    try {
      await requestReadiness({ action: "mark-ready", seasonId: season.id });
    } catch (error) {
      if (error.report) setReadiness((current) => ({ ...current, [season.id]: error.report }));
      setStatus("error"); setMessage(error.message); return;
    }
    await load(); setMessage(`${season.label} est prête, mais pas encore la saison par défaut.`);
  };
  const activate = async (season) => {
    setStatus("saving"); setMessage("");
    try {
      const result = await requestReadiness({ seasonId: season.id });
      const report = result.reports?.[0];
      if (report) setReadiness((current) => ({ ...current, [season.id]: report }));
      if (!report?.ok) throw new Error("La saison ne satisfait plus tous les contrôles obligatoires.");
    } catch (error) {
      setStatus("error"); setMessage(error.message); return;
    }
    if (!window.confirm(`Activer ${season.label} sur le site public ?\n\nLes autres saisons resteront consultables.`)) { setStatus("idle"); return; }
    const { error } = await supabase.rpc("activate_competition_season", { target_season: season.id });
    if (error) { setStatus("error"); setMessage(error.message); return; }
    await load(); setMessage(`${season.label} est maintenant la saison proposée par défaut.`);
  };

  const estimate = useMemo(() => importPlanEstimate(plan), [plan]);
  const schedule = useMemo(() => importPlanSchedule(plan, competitions, nationalTeams), [plan, competitions, nationalTeams]);
  const competitionName = Object.fromEntries(competitions.map((competition) => [competition.id, competition.name]));
  const scopeBuckets = useMemo(() => groupCompetitionsByScope(
    competitions,
    (a, b) => (Number(plan.competitions[a.id]?.order) || 999) - (Number(plan.competitions[b.id]?.order) || 999) || a.name.localeCompare(b.name),
  ), [competitions, plan.competitions]);
  // Saisons (activation publique) rangées avec la MÊME taxonomie que le plan, pour
  // qu'une liste qui grossit reste navigable. Filtre de saison pour retrouver vite 2025-2026.
  const competitionById = useMemo(() => Object.fromEntries(competitions.map((competition) => [competition.id, competition])), [competitions]);
  const activationGroups = useMemo(() => {
    const buckets = { belgique: [], europe: [], etranger: {}, international: [] };
    const sortRows = (rows) => rows.sort((a, b) => (competitionName[a.competition_id] || "").localeCompare(competitionName[b.competition_id] || "") || String(b.label).localeCompare(String(a.label)));
    for (const season of seasons) {
      if (activationSeason !== "all" && season.label !== activationSeason) continue;
      const competition = competitionById[season.competition_id];
      const scope = resolveCompetitionScope(competition || {});
      if (scope === "etranger") (buckets.etranger[competitionCountry(competition)] ||= []).push(season);
      else buckets[scope].push(season);
    }
    sortRows(buckets.belgique); sortRows(buckets.europe); sortRows(buckets.international);
    for (const country of Object.keys(buckets.etranger)) sortRows(buckets.etranger[country]);
    return buckets;
  }, [seasons, activationSeason, competitionById, competitionName]);

  const renderSeasonRow = (season) => {
    const report = readiness[season.id];
    const failedChecks = report?.checks?.filter((item) => item.blocking && !item.ok) || [];
    return <div key={season.id} className="border-t border-line/10 p-3 text-sm"><div className="flex flex-wrap items-center gap-3"><div className="min-w-[190px] flex-1"><b>{competitionName[season.competition_id] || "Compétition"} · {season.label}</b><div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{season.import_status || "inconnu"}{report?.scopeLabel ? ` · ${report.scopeLabel}` : ""}</div></div><div className="min-w-[150px] sm:w-52"><div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted"><span>Contrôles</span><span>{report ? `${report.progress}%` : "…"}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-bg"><div className={`h-full rounded-full ${report?.ok ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${report?.progress || 0}%` }} /></div></div>{season.public_active ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Par défaut</span> : <>{["draft", "error", "importing"].includes(season.import_status) && <button type="button" onClick={() => markReady(season)} disabled={status === "saving" || !report?.ok} className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200 disabled:cursor-not-allowed disabled:opacity-40">{report?.ok ? "Marquer prête" : "Contrôles incomplets"}</button>}{season.import_status === "ready" && <button type="button" onClick={() => activate(season)} disabled={status === "saving" || !report?.ok} className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">{report?.ok ? "Utiliser par défaut" : "Revalidation requise"}</button>}</>}</div>{report && <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]"><div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted"><span>{report.counts.matches}{report.counts.expectedMatches ? ` / ${report.counts.expectedMatches}` : ""} matchs</span><span>{report.counts.clubs}{report.counts.expectedClubs ? ` / ${report.counts.expectedClubs}` : ""} clubs</span>{report.scope !== "base" && <span>{report.counts.memberships} affectations d’effectif</span>}{report.scope === "complete" && <span>{report.counts.pendingEvents + report.counts.pendingLineups + report.counts.pendingPlayerStats} traitements de match restants</span>}</div>{failedChecks.length > 0 && <div className="text-[11px] text-amber-200">{failedChecks.map((item) => `${item.label} : ${item.detail}`).join(" · ")}</div>}</div>}</div>;
  };
  const analyzeMaintenance = async () => {
    if (!maintenanceSeasonId) return;
    setMaintenanceStatus("loading"); setMaintenanceReport(null);
    try {
      const report = await requestMaintenance({ seasonId: maintenanceSeasonId, action: "analyze" });
      setMaintenanceReport(report);
      setMaintenanceCoverage(Object.fromEntries((report.clubs || []).map((club) => [club.id, club.level])));
      setPurgePreview(null); setPurgeConfirmation("");
      setMaintenanceStatus("ready");
    } catch (error) {
      setMaintenanceReport({ error: error.message });
      setMaintenanceStatus("error");
    }
  };
  const analyzeDuplicates = async () => {
    setDuplicateAuditStatus("loading");
    try { setDuplicateAudit(await requestMaintenance({ action: "audit-duplicates" })); setDuplicateAuditStatus("ready"); }
    catch (error) { setDuplicateAudit({ error: error.message }); setDuplicateAuditStatus("error"); }
  };
  const saveCoverage = async () => {
    setMaintenanceStatus("loading");
    try {
      const report = await requestMaintenance({ seasonId: maintenanceSeasonId, action: "save-coverage", coverage: (maintenanceReport?.clubs || []).map((club) => ({ clubId: club.id, level: maintenanceCoverage[club.id] || club.level, reason: club.reason })) });
      setMaintenanceReport(report); setMaintenanceCoverage(Object.fromEntries((report.clubs || []).map((club) => [club.id, club.level]))); setPurgePreview(null); setMaintenanceStatus("ready");
    } catch (error) { setMaintenanceReport((current) => ({ ...(current || {}), error: error.message })); setMaintenanceStatus("error"); }
  };
  const previewPurge = async () => {
    setMaintenanceStatus("loading");
    try { const result = await requestMaintenance({ seasonId: maintenanceSeasonId, action: "preview" }); setPurgePreview(result.result); setMaintenanceStatus("ready"); }
    catch (error) { setMaintenanceReport((current) => ({ ...(current || {}), error: error.message })); setMaintenanceStatus("error"); }
  };
  const applyPurge = async () => {
    if (!purgePreview || purgeConfirmation !== maintenanceReport?.competition?.name) return;
    if (!window.confirm("Dernière confirmation : archiver les effectifs secondaires et supprimer leurs détails provider ? Les clubs, matchs, résultats et joueurs resteront conservés.")) return;
    setMaintenanceStatus("loading");
    try {
      const result = await requestMaintenance({ seasonId: maintenanceSeasonId, action: "archive", confirmation: purgeConfirmation });
      setPurgePreview(result.result); setMaintenanceStatus("ready");
      const report = await requestMaintenance({ seasonId: maintenanceSeasonId, action: "analyze" });
      setMaintenanceReport(report);
    } catch (error) { setMaintenanceReport((current) => ({ ...(current || {}), error: error.message })); setMaintenanceStatus("error"); }
  };

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

    <section className="mb-6 rounded-2xl border border-line/10 bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">Compétitions par territoire</h2><p className="text-xs text-muted">Belgique, Europe et international sont séparés sans modifier l’ordre réel des imports.</p></div><button type="button" onClick={save} disabled={status === "saving" || schedule.capacity <= 0 || schedule.oversized.length > 0} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{status === "saving" ? "Enregistrement…" : "Enregistrer le plan"}</button></div>
      <div className="mb-4 rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><b className="text-sm text-violet-100">Audit des doublons provider</b><p className="mt-1 text-[11px] leading-5 text-muted">Compare les fiches ayant le même ID API, leurs saisons et leurs matchs. Lecture seule : rien ne sera fusionné ni supprimé.</p></div><button type="button" onClick={analyzeDuplicates} disabled={duplicateAuditStatus === "loading"} className="inline-flex items-center gap-2 rounded-lg border border-violet-300/25 bg-violet-400/10 px-3 py-2 text-xs font-bold text-violet-100 disabled:opacity-50"><Search className={`h-3.5 w-3.5 ${duplicateAuditStatus === "loading" ? "animate-pulse" : ""}`} />{duplicateAuditStatus === "loading" ? "Audit…" : "Auditer maintenant"}</button></div>{duplicateAudit?.error && <p className="mt-3 text-xs text-red-200">{duplicateAudit.error}</p>}{duplicateAudit && !duplicateAudit.error && <div className="mt-3 space-y-2 text-xs"><div className="rounded-lg border border-line/10 bg-bg/30 p-2.5"><b>{duplicateAudit.duplicates?.length || 0} doublon(s) de compétition détecté(s)</b><span className="ml-2 text-muted">et {duplicateAudit.belgianSelections?.length || 0} sélection(s) belges présentes.</span></div>{duplicateAudit.duplicates?.map((group) => <div key={group.key} className="overflow-hidden rounded-lg border border-amber-400/20"><div className="bg-amber-400/[0.06] px-3 py-2 font-bold text-amber-100">ID API {group.externalId} · {group.provider}</div>{group.rows.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/10 px-3 py-2"><b>{row.name}</b><span className="text-muted">{row.matches} matchs · {row.seasons.map((season) => season.label).join(", ") || "aucune saison"}</span>{row.publicVisible && <span className="text-emerald-300">public</span>}</div>)}</div>)}{duplicateAudit.belgianSelections?.length > 0 && <div className="rounded-lg border border-sky-400/20 bg-sky-400/[0.05] p-2.5"><b className="text-sky-100">Sélections belges détectées :</b><span className="ml-2 text-muted">{duplicateAudit.belgianSelections.map((team) => `${team.name} (${team.category}${team.followed ? ", suivie" : ""})`).join(" · ")}</span></div>}</div>}</div>
      <div className="space-y-4">{PLAN_CATEGORIES.map((category) => {
        // « Étranger » : rangé par pays. Autres catégories : liste à plat.
        const countries = category.byCountry ? Object.keys(scopeBuckets.etranger).sort((a, b) => a.localeCompare(b)) : [];
        const rows = category.byCountry ? [] : (scopeBuckets[category.key] || []);
        const count = category.byCountry ? countries.reduce((sum, country) => sum + scopeBuckets.etranger[country].length, 0) : rows.length;
        const includesSelections = category.key === "international" && nationalTeams.length > 0;
        return <details key={category.key} open className="overflow-hidden rounded-2xl border border-line/10 bg-bg/25">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden"><span className="text-xl">{category.icon}</span><span className="min-w-0 flex-1"><b className="block">{category.label}</b><span className="block truncate text-[11px] text-muted">{category.description}</span></span><span className="rounded-full border border-line/10 bg-surface px-2.5 py-1 text-[10px] font-bold text-muted">{count + (includesSelections ? nationalTeams.length : 0)} cible(s)</span></summary>
          <div className="space-y-3 border-t border-line/10 p-3">
            {category.byCountry
              ? countries.map((country) => <div key={country} className="space-y-3"><div className="flex items-center gap-2 px-1 pt-1"><span className="text-[10px] font-black uppercase tracking-[.16em] text-muted">{country}</span><span className="rounded-full border border-line/10 bg-surface px-2 py-0.5 text-[9px] font-bold text-muted">{scopeBuckets.etranger[country].length}</span></div>{scopeBuckets.etranger[country].map(renderCompetitionArticle)}</div>)
              : rows.map(renderCompetitionArticle)}
            {includesSelections && <div className="space-y-3"><div className="px-1 pt-1 text-[10px] font-black uppercase tracking-[.16em] text-muted">Sélections belges suivies</div>{nationalTeams.map((team, index) => { const externalId = String(team.external_id || ""); const config = plan.nationalTeams[externalId] || hydrateNationalConfig({}, index); return <article key={team.id} className="rounded-xl border border-line/10 bg-surface/70 p-3"><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={config.enabled} disabled={!externalId} onChange={(event) => updateNational(externalId, { enabled: event.target.checked })} />Autoriser</label><div className="min-w-[180px] flex-1"><b className="block text-sm">{team.name}</b><span className="text-[10px] text-muted">ID équipe {externalId || "manquant"}</span></div><label className="text-[10px] uppercase text-muted">Ordre<input type="number" min="1" value={config.order} onChange={(event) => updateNational(externalId, { order: Number(event.target.value) || 999 })} className="mt-1 w-20 rounded border border-line/10 bg-surface2 px-2 py-1 text-sm text-content" /></label></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{plan.seasons.map((season) => <div key={season.label}><div className="mb-1 text-[10px] font-black text-muted">{season.label}</div><SeasonTarget national value={config.seasons[season.label]} disabled={!config.enabled || !season.enabled} onChange={(patch) => updateNationalSeason(externalId, season.label, patch)} /></div>)}</div></article>; })}</div>}
            {!count && !includesSelections && <p className="rounded-xl border border-dashed border-line/15 p-4 text-sm text-muted">Aucune compétition dans cette catégorie.</p>}
          </div>
        </details>;
      })}</div>
    </section>

    <section className="mb-6 rounded-2xl border border-accent/20 bg-accent/5 p-4"><h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-accent"><LockKeyhole className="h-4 w-4" />Ordre quotidien autorisé</h2>{schedule.days.length ? <div className="space-y-4">{schedule.days.map((day) => <div key={day.day}><h3 className="mb-2 text-xs font-black">Jour {day.day} · ≈ {day.cost} / {schedule.capacity} appels d’import</h3><ol className="space-y-1.5">{day.targets.map((target, index) => <li key={`${target.type}-${target.id}-${target.season}`} className="flex items-center gap-3 rounded-lg border border-line/10 bg-surface px-3 py-2 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-xs font-black text-accent">{index + 1}</span><span className="flex-1 font-bold">{target.season} · {target.label}</span><span className="text-[10px] uppercase text-muted">≈ {target.cost} · {IMPORT_SCOPES[target.scope]?.label} · {groupLabel[target.group] || target.group}</span></li>)}</ol></div>)}</div> : <p className="text-sm text-muted">Aucune cible autorisée. Tous les imports seront bloqués après enregistrement.</p>}{schedule.capacity <= 0 && <div className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-200">Les réserves carrières et direct utilisent tout le quota quotidien. Réduis-les avant d’enregistrer.</div>}{schedule.oversized.length > 0 && <div className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-200">Une cible dépasse à elle seule la capacité quotidienne : {schedule.oversized.map((target) => `${target.season} · ${target.label} (≈ ${target.cost})`).join(", ")}. Réduis son périmètre ou augmente le quota avant d’enregistrer.</div>}</section>

    <section className="mb-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-black"><Database className="h-4 w-4 text-cyan-300" />Entretien des données</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Inventorie une saison, attribue un niveau à chaque club puis simule obligatoirement l’archivage avant confirmation.</p></div><span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-200">Simulation obligatoire</span></div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><select value={maintenanceSeasonId} onChange={(event) => { setMaintenanceSeasonId(event.target.value); setMaintenanceReport(null); setMaintenanceStatus("idle"); }} className="min-w-0 flex-1 rounded-xl border border-line/10 bg-surface2 px-3 py-2 text-sm">{seasons.map((season) => <option key={season.id} value={season.id}>{competitionName[season.competition_id] || "Compétition"} · {season.label}</option>)}</select><button type="button" onClick={analyzeMaintenance} disabled={!maintenanceSeasonId || maintenanceStatus === "loading"} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 disabled:opacity-50"><Search className={`h-4 w-4 ${maintenanceStatus === "loading" ? "animate-pulse" : ""}`} />{maintenanceStatus === "loading" ? "Analyse…" : "Analyser la saison"}</button></div>
      {maintenanceReport?.error && <div className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">{maintenanceReport.error}</div>}
      {maintenanceReport?.counts && <div className="mt-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{[
        ["Matchs conservés", maintenanceReport.counts.matches], ["Clubs conservés", maintenanceReport.counts.clubs], ["Affectations", maintenanceReport.counts.memberships], ["Événements", maintenanceReport.counts.events], ["Compositions", maintenanceReport.counts.lineups], ["Stats joueurs", maintenanceReport.counts.playerStats], ["Lignes protégées", maintenanceReport.counts.protectedRows],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-line/10 bg-surface/70 p-3"><b className="block text-lg">{value}</b><span className="text-[10px] text-muted">{label}</span></div>)}</div>
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100"><b>Protection active.</b> {maintenanceReport.nextStep}<ul className="mt-2 list-disc space-y-1 pl-4 text-muted">{maintenanceReport.safeguards.map((item) => <li key={item}>{item}</li>)}</ul></div>
        {maintenanceReport.clubs?.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border border-line/10"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/10 bg-surface px-3 py-2"><div><b className="text-sm">Niveau par club</b><p className="text-[10px] text-muted">Les suggestions ne deviennent actives qu’après enregistrement.</p></div><button type="button" onClick={saveCoverage} disabled={maintenanceStatus === "loading"} className="rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-bold text-cyan-100 disabled:opacity-50">Enregistrer les niveaux</button></div><div className="max-h-[440px] divide-y divide-line/10 overflow-y-auto">{maintenanceReport.clubs.map((club) => <div key={club.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center"><div className="flex min-w-0 items-center gap-2">{club.logoUrl ? <img src={club.logoUrl} className="h-7 w-7 shrink-0 object-contain" alt="" /> : <span className="h-7 w-7 shrink-0 rounded bg-white/[0.05]" />}<span className="min-w-0"><b className="block truncate text-xs">{club.name}</b><span className="text-[10px] text-muted">{club.trackedPlayers ? `${club.trackedPlayers} Belge(s) suivi(s) · ` : ""}{club.saved ? "choix enregistré" : `suggestion : ${club.suggested}`}{club.archivedAt ? " · archivé" : ""}</span></span></div><select value={maintenanceCoverage[club.id] || club.level} onChange={(event) => { setMaintenanceCoverage((current) => ({ ...current, [club.id]: event.target.value })); setPurgePreview(null); }} className="rounded-lg border border-line/10 bg-surface2 px-2 py-1.5 text-xs"><option value="full">Suivi complet</option><option value="match">Matchs détaillés</option><option value="results">Résultats uniquement</option></select></div>)}</div></div>}
        {maintenanceReport.clubs?.every((club) => club.saved) && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/[0.04] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><b className="text-sm text-red-100">Archivage des données secondaires</b><p className="mt-1 text-[11px] text-muted">Conserve clubs, matchs, scores, événements et joueurs. Retire uniquement les détails provider des clubs en « Résultats uniquement ».</p></div><button type="button" onClick={previewPurge} disabled={maintenanceStatus === "loading"} className="rounded-lg border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100 disabled:opacity-50">Simuler la purge</button></div>{purgePreview && <div className="mt-3 rounded-lg border border-line/10 bg-bg/40 p-3 text-xs"><div className="flex flex-wrap gap-x-4 gap-y-1"><span><b>{purgePreview.clubs}</b> clubs secondaires</span><span><b>{purgePreview.detail_rows}</b> détails supprimables</span><span><b>{purgePreview.memberships_archived}</b> affectations archivables</span></div>{!purgePreview.applied && purgePreview.clubs > 0 && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={purgeConfirmation} onChange={(event) => setPurgeConfirmation(event.target.value)} placeholder={`Recopie : ${maintenanceReport.competition?.name || "compétition"}`} className="min-w-0 flex-1 rounded-lg border border-red-300/20 bg-surface2 px-3 py-2 text-sm" /><button type="button" onClick={applyPurge} disabled={purgeConfirmation !== maintenanceReport.competition?.name || maintenanceStatus === "loading"} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Archiver et purger</button></div>}{purgePreview.applied && <p className="mt-2 font-bold text-emerald-300">Archivage terminé.</p>}</div>}</div>}
      </div>}
    </section>

    <section><div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black">Activation publique des saisons</h2><p className="mt-1 text-xs text-muted">Chaque saison est contrôlée côté serveur. Une archive prête reste consultable et une seule saison est proposée par défaut pour chaque compétition.</p></div><label className="text-[10px] font-bold uppercase tracking-wider text-muted">Filtrer par saison<select value={activationSeason} onChange={(event) => setActivationSeason(event.target.value)} className="mt-1 block rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm font-normal normal-case text-content"><option value="all">Toutes les saisons</option>{plan.seasons.map((season) => <option key={season.label} value={season.label}>{season.label}</option>)}</select></label></div>
      <div className="space-y-4">{COMPETITION_SCOPES.map((category) => {
        const countries = category.byCountry ? Object.keys(activationGroups.etranger).sort((a, b) => a.localeCompare(b)) : [];
        const rows = category.byCountry ? [] : (activationGroups[category.key] || []);
        const count = category.byCountry ? countries.reduce((sum, country) => sum + activationGroups.etranger[country].length, 0) : rows.length;
        if (!count) return null;
        return <details key={category.key} open className="overflow-hidden rounded-2xl border border-line/10 bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden"><span className="text-xl">{category.icon}</span><b className="min-w-0 flex-1">{category.label}</b><span className="rounded-full border border-line/10 bg-bg/40 px-2.5 py-1 text-[10px] font-bold text-muted">{count} saison(s)</span></summary>
          <div>{category.byCountry
            ? countries.map((country) => <div key={country}><div className="border-t border-line/10 bg-bg/30 px-4 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-muted">{country}</div>{activationGroups.etranger[country].map(renderSeasonRow)}</div>)
            : rows.map(renderSeasonRow)}</div>
        </details>;
      })}</div>
      {!seasons.length && <p className="rounded-2xl border border-dashed border-line/15 p-4 text-sm text-muted">Aucune saison importée pour le moment.</p>}
      {seasons.length > 0 && !COMPETITION_SCOPES.some((category) => category.byCountry ? Object.keys(activationGroups.etranger).length : activationGroups[category.key]?.length) && <p className="rounded-2xl border border-dashed border-line/15 p-4 text-sm text-muted">Aucune saison pour ce filtre.</p>}
    </section>
    <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Les projections sont volontairement hautes et réparties sur plusieurs journées si nécessaire. Le préflight basé sur les données déjà importées donnera le coût précis avant chaque pipeline.</p></div>
  </div>;
}
