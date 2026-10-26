"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { normalizeImportPlan } from "@/lib/importPlan";
import { COMPETITION_SCOPES, competitionCountry, resolveCompetitionScope } from "@/lib/competitionScopes";
import { HIDDEN_COMPETITIONS_KEY, matchesQuery, toggleInList, useViewPrefs } from "@/lib/adminViewPrefs";
import { distinctProviderCompetitions, Group, HideButton, PLAN_COMPETITION_COLUMNS, requestReadiness, SearchField, ToggleChip } from "@/components/admin/importPlanShared";

// Saisons : activation publique et contrôles de publication (anciennement en bas
// de la page « Plan d'import »). Contrôles côté serveur, une saison à la fois.
export default function SeasonActivationPanel() {
  const [competitions, setCompetitions] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [planSeasons, setPlanSeasons] = useState([]);
  const [readiness, setReadiness] = useState({});
  const [readinessBusy, setReadinessBusy] = useState({});
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  // Affichage seulement (ce navigateur). Masquage partagé avec « Plan d'import ».
  const [hidden, setHidden] = useViewPrefs(HIDDEN_COMPETITIONS_KEY, []);
  const [openGroups, setOpenGroups] = useViewPrefs("seasons-groups", {});
  const [view, setView] = useViewPrefs("seasons-filters", { season: "all", onlyPending: false, showHidden: false });
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    const [competitionResult, settingsResult, seasonResult] = await Promise.all([
      supabase.from("competitions").select(PLAN_COMPETITION_COLUMNS).not("provider", "is", null).order("name"),
      supabase.from("site_settings").select("data").eq("id", 1).maybeSingle(),
      supabase.from("seasons").select("id,label,competition_id,import_status,public_active,activated_at").order("label", { ascending: false }),
    ]);
    const error = competitionResult.error || settingsResult.error || seasonResult.error;
    if (error) { setStatus("error"); setMessage(error.message); return; }
    const seasonRows = seasonResult.data || [];
    setCompetitions(distinctProviderCompetitions(competitionResult.data || [], seasonRows));
    setSeasons(seasonRows);
    setPlanSeasons(normalizeImportPlan(settingsResult.data?.data?.football_import_plan).seasons.map((season) => season.label));
    // Contrôles chargés À LA DEMANDE (bouton par saison) : l'audit groupé de toutes
    // les saisons dépassait le timeout dès qu'on importait beaucoup de championnats.
    setReadiness({});
    setStatus("idle");
  }, []);
  useEffect(() => { load(); }, [load]);

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

  const competitionById = useMemo(() => Object.fromEntries(competitions.map((competition) => [competition.id, competition])), [competitions]);
  const competitionName = (id) => competitionById[id]?.name || "Compétition";
  const hiddenSet = new Set(hidden);
  // Saisons rangées avec la MÊME taxonomie que le plan ; filtres d'affichage.
  const activationGroups = useMemo(() => {
    const hiddenIds = new Set(hidden);
    const buckets = { belgique: [], europe: [], etranger: {}, international: [] };
    const sortRows = (rows) => rows.sort((a, b) => (competitionById[a.competition_id]?.name || "").localeCompare(competitionById[b.competition_id]?.name || "") || String(b.label).localeCompare(String(a.label)));
    for (const season of seasons) {
      if (view.season !== "all" && season.label !== view.season) continue;
      if (view.onlyPending && season.public_active) continue;
      if (!view.showHidden && hiddenIds.has(String(season.competition_id))) continue;
      const competition = competitionById[season.competition_id];
      if (!matchesQuery([competition?.name, competition?.ext?.country, season.label], query)) continue;
      const scope = resolveCompetitionScope(competition || {});
      if (scope === "etranger") (buckets.etranger[competitionCountry(competition)] ||= []).push(season);
      else buckets[scope].push(season);
    }
    sortRows(buckets.belgique); sortRows(buckets.europe); sortRows(buckets.international);
    for (const country of Object.keys(buckets.etranger)) sortRows(buckets.etranger[country]);
    return buckets;
  }, [seasons, view, hidden, query, competitionById]);
  // Liste à plat des saisons affichées, pour « Vérifier les contrôles affichés ».
  const visibleSeasons = useMemo(() => [
    ...activationGroups.belgique,
    ...activationGroups.europe,
    ...Object.values(activationGroups.etranger).flat(),
    ...activationGroups.international,
  ], [activationGroups]);
  const hiddenCompetitionsWithSeasons = new Set(seasons.filter((season) => hiddenSet.has(String(season.competition_id))).map((season) => season.competition_id)).size;
  const searching = query.trim().length > 0;
  const groupIds = COMPETITION_SCOPES.flatMap((category) => [category.key, ...(category.byCountry ? Object.keys(activationGroups.etranger).map((country) => `etranger:${country}`) : [])]);
  const groupState = searching ? Object.fromEntries(groupIds.map((id) => [id, true])) : openGroups;

  // Audit d'UNE saison à la fois (requête légère, jamais de timeout).
  const auditSeason = async (seasonId) => {
    setReadinessBusy((current) => ({ ...current, [seasonId]: true }));
    try {
      const result = await requestReadiness({ seasonIds: [seasonId] });
      const report = (result.reports || [])[0];
      if (report) setReadiness((current) => ({ ...current, [seasonId]: report }));
    } catch (error) {
      setStatus("error"); setMessage(`Contrôle de saison indisponible : ${error.message}`);
    } finally {
      setReadinessBusy((current) => ({ ...current, [seasonId]: false }));
    }
  };
  // Vérifie les saisons affichées une par une (séquentiel = pas de requête géante).
  const auditVisibleSeasons = async () => {
    for (const season of visibleSeasons) {
      if (!readiness[season.id]) await auditSeason(season.id);
    }
  };

  const renderSeasonRow = (season) => {
    const report = readiness[season.id];
    const busy = readinessBusy[season.id];
    const failedChecks = report?.checks?.filter((item) => item.blocking && !item.ok) || [];
    const isHidden = hiddenSet.has(String(season.competition_id));
    return <div key={season.id} className={`border-t border-line/10 p-3 text-sm ${isHidden ? "opacity-60" : ""}`}><div className="flex flex-wrap items-center gap-3"><div className="min-w-[190px] flex-1"><b>{competitionName(season.competition_id)} · {season.label}</b><div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{season.import_status || "inconnu"}{report?.scopeLabel ? ` · ${report.scopeLabel}` : ""}</div></div>{report && <div className="min-w-[150px] sm:w-52"><div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted"><span>Contrôles</span><span>{report.progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-bg"><div className={`h-full rounded-full ${report.ok ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${report.progress || 0}%` }} /></div></div>}{season.public_active ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Par défaut</span> : !report ? <button type="button" onClick={() => auditSeason(season.id)} disabled={busy} className="rounded-lg border border-line/20 px-3 py-1.5 text-xs font-bold text-muted hover:text-content disabled:opacity-50">{busy ? "Contrôle…" : "Vérifier les contrôles"}</button> : <>{["draft", "error", "importing"].includes(season.import_status) && <button type="button" onClick={() => markReady(season)} disabled={status === "saving" || !report.ok} className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200 disabled:cursor-not-allowed disabled:opacity-40">{report.ok ? "Marquer prête" : "Contrôles incomplets"}</button>}{season.import_status === "ready" && <button type="button" onClick={() => activate(season)} disabled={status === "saving" || !report.ok} className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40">{report.ok ? "Utiliser par défaut" : "Revalidation requise"}</button>}</>}<HideButton hidden={isHidden} label={competitionName(season.competition_id)} onToggle={() => setHidden((current) => toggleInList(current, season.competition_id))} /></div>{report && <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]"><div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted"><span>{report.counts.matches}{report.counts.expectedMatches ? ` / ${report.counts.expectedMatches}` : ""} matchs</span><span>{report.counts.clubs}{report.counts.expectedClubs ? ` / ${report.counts.expectedClubs}` : ""} clubs</span>{report.scope !== "base" && <span>{report.counts.memberships} affectations d’effectif</span>}{report.scope === "complete" && <span>{report.counts.pendingEvents + report.counts.pendingLineups + report.counts.pendingPlayerStats} traitements de match restants</span>}</div>{failedChecks.length > 0 && <div className="text-[11px] text-amber-200">{failedChecks.map((item) => `${item.label} : ${item.detail}`).join(" · ")}</div>}</div>}</div>;
  };

  return <div>
    <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Synchronisation</p><h1 className="mt-1 text-2xl font-black">Saisons</h1><p className="mt-1 max-w-3xl text-sm text-muted">Activation publique des saisons. Chaque saison est contrôlée côté serveur. Une archive prête reste consultable et une seule saison est proposée par défaut pour chaque compétition.</p></div><button type="button" onClick={load} disabled={["loading", "saving"].includes(status)} className="rounded-xl border border-line/15 bg-surface p-2 text-muted hover:text-white disabled:opacity-50" title="Actualiser"><RefreshCw className={`h-4 w-4 ${status === "loading" ? "animate-spin" : ""}`} /></button></div>
    {message && <div className={`mb-5 rounded-xl border p-3 text-sm ${status === "error" ? "border-red-400/25 bg-red-500/10 text-red-200" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"}`}>{message}</div>}
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <SearchField value={query} onChange={setQuery} placeholder="Rechercher une compétition, un pays, une saison…" />
      <label className="flex items-center gap-2 text-xs text-muted">Saison<select value={view.season} onChange={(event) => setView((current) => ({ ...current, season: event.target.value }))} className="rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm text-content"><option value="all">Toutes</option>{[...new Set([...planSeasons, ...seasons.map((season) => season.label)])].sort((a, b) => b.localeCompare(a)).map((label) => <option key={label} value={label}>{label}</option>)}</select></label>
      <ToggleChip checked={view.onlyPending} onChange={(onlyPending) => setView((current) => ({ ...current, onlyPending }))} title="Masquer les saisons déjà proposées par défaut">À traiter seulement</ToggleChip>
      <ToggleChip checked={view.showHidden} onChange={(showHidden) => setView((current) => ({ ...current, showHidden }))}>Afficher les masquées ({hiddenCompetitionsWithSeasons})</ToggleChip>
      <button type="button" onClick={auditVisibleSeasons} disabled={!visibleSeasons.length} className="rounded-lg border border-line/15 bg-surface px-3 py-2 text-xs font-bold text-muted hover:text-content disabled:opacity-50" title="Lance les contrôles des saisons affichées, une par une">Vérifier les contrôles affichés ({visibleSeasons.length})</button>
    </div>
    <p className="mb-4 text-[11px] text-muted">{visibleSeasons.length} saison(s) affichée(s) sur {seasons.length}. Le masquage est partagé avec « Plan d’import » et mémorisé dans ce navigateur ; il ne change rien sur le site.</p>
    <div className="space-y-3">{COMPETITION_SCOPES.map((category) => {
      const countries = category.byCountry ? Object.keys(activationGroups.etranger).sort((a, b) => a.localeCompare(b)) : [];
      const rows = category.byCountry ? [] : (activationGroups[category.key] || []);
      const count = category.byCountry ? countries.reduce((sum, country) => sum + activationGroups.etranger[country].length, 0) : rows.length;
      if (!count) return null;
      return <Group key={category.key} id={category.key} openGroups={groupState} setOpenGroups={setOpenGroups} defaultOpen={category.key === "belgique"} className="bg-surface" header={<span className="flex items-center gap-3"><span className="text-xl">{category.icon}</span><b className="min-w-0 flex-1">{category.label}</b><span className="rounded-full border border-line/10 bg-bg/40 px-2.5 py-1 text-[10px] font-bold text-muted">{count} saison(s)</span></span>}>
        <div>{category.byCountry
          ? countries.map((country) => <Group key={country} id={`etranger:${country}`} openGroups={groupState} setOpenGroups={setOpenGroups} className="m-2 bg-bg/30" header={<span className="flex items-center gap-2"><span className="text-[11px] font-black uppercase tracking-[.16em] text-muted">{country}</span><span className="rounded-full border border-line/10 bg-surface px-2 py-0.5 text-[9px] font-bold text-muted">{activationGroups.etranger[country].length}</span></span>}>{activationGroups.etranger[country].map(renderSeasonRow)}</Group>)
          : rows.map(renderSeasonRow)}</div>
      </Group>;
    })}</div>
    {!seasons.length && status !== "loading" && <p className="rounded-2xl border border-dashed border-line/15 p-4 text-sm text-muted">Aucune saison importée pour le moment.</p>}
    {seasons.length > 0 && !visibleSeasons.length && <p className="rounded-2xl border border-dashed border-line/15 p-4 text-sm text-muted">Aucune saison pour ces filtres.</p>}
  </div>;
}
