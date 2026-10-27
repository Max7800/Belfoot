"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, LockKeyhole, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  DEFAULT_IMPORT_PLAN,
  IMPORT_GROUPS,
  IMPORT_SCOPES,
  ADDED_SEASON_ROLE,
  addImportSeason,
  hydrateCompetitionConfig,
  hydrateNationalConfig,
  importPlanEstimate,
  importPlanSchedule,
  normalizeImportPlan,
  removeImportSeason,
} from "@/lib/importPlan";
import { COMPETITION_SCOPES, groupCompetitionsByScope } from "@/lib/competitionScopes";
import { updateSiteSettings } from "@/lib/siteSettings";
import { HIDDEN_COMPETITIONS_KEY, toggleInList, useViewPrefs, visibleItems } from "@/lib/adminViewPrefs";
import { distinctProviderCompetitions, Group, HideButton, PLAN_COMPETITION_COLUMNS, SearchField, ToggleChip } from "@/components/admin/importPlanShared";

// Plan d'import : budget, saisons, compétitions et sélections autorisées, ordre
// quotidien. L'activation des saisons et l'entretien des données ont leurs
// propres pages (« Saisons », « Entretien des données »).
const groupLabel = Object.fromEntries(IMPORT_GROUPS.map((group) => [group.key, group.label]));
const scopeOptions = Object.entries(IMPORT_SCOPES);
// Catégories du plan = taxonomie partagée avec le sélecteur de sync (Belgique / Europe /
// Étranger par pays / Sélections). La catégorie « Sélections » (international) porte aussi
// les sélections nationales suivies.
const PLAN_CATEGORIES = COMPETITION_SCOPES;
const teamKey = (externalId) => `team:${externalId}`;

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
  const [plan, setPlan] = useState(DEFAULT_IMPORT_PLAN);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  // Plan tel que lu en base à l'ouverture : l'enregistrement est refusé s'il a
  // changé entre-temps (renouvellement de campagne, autre onglet).
  const loadedPlan = useRef(null);
  // Affichage seulement (ce navigateur) : rien de tout cela n'entre dans le plan.
  const [hidden, setHidden] = useViewPrefs(HIDDEN_COMPETITIONS_KEY, []);
  const [openGroups, setOpenGroups] = useViewPrefs("import-plan-groups", {});
  const [view, setView] = useViewPrefs("import-plan-filters", { onlyAllowed: false, showHidden: false });
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setStatus("loading"); setMessage("");
    const [competitionResult, nationalResult, settingsResult, seasonResult] = await Promise.all([
      supabase.from("competitions").select(PLAN_COMPETITION_COLUMNS).not("provider", "is", null).order("name"),
      supabase.from("clubs").select("id,name,external_id,national_category,national_gender").eq("team_type", "national").eq("national_followed", true).order("name"),
      supabase.from("site_settings").select("data").eq("id", 1).maybeSingle(),
      supabase.from("seasons").select("id,competition_id"),
    ]);
    const error = competitionResult.error || nationalResult.error || settingsResult.error || seasonResult.error;
    if (error) { setStatus("error"); setMessage(error.message); return; }
    const rawCompetitionRows = competitionResult.data || [];
    const nationalRows = nationalResult.data || [];
    loadedPlan.current = settingsResult.data?.data?.football_import_plan ?? null;
    const stored = normalizeImportPlan(settingsResult.data?.data?.football_import_plan);
    const resetArchiveScopes = stored.version < 3;
    const resetSeasonEstimates = stored.version < 4;
    const competitionRows = distinctProviderCompetitions(rawCompetitionRows, seasonResult.data || []);
    setCompetitions(competitionRows);
    setNationalTeams(nationalRows);
    setPlan({
      ...stored,
      version: 4,
      competitions: Object.fromEntries(competitionRows.map((competition, index) => [competition.id, hydrateCompetitionConfig(competition, stored.competitions[competition.id], index, { resetArchiveScopes, resetSeasonEstimates, seasons: stored.seasons })])),
      nationalTeams: Object.fromEntries(nationalRows.filter((team) => team.external_id).map((team, index) => [String(team.external_id), hydrateNationalConfig(stored.nationalTeams[String(team.external_id)], index, { resetArchiveScopes, seasons: stored.seasons })])),
    });
    const hiddenDuplicates = rawCompetitionRows.length - competitionRows.length;
    if (resetArchiveScopes || resetSeasonEstimates || hiddenDuplicates) setMessage(`${resetArchiveScopes || resetSeasonEstimates ? "Plan adapté : périmètre et nombres de clubs/matchs sont maintenant définis saison par saison." : ""}${hiddenDuplicates ? `${resetArchiveScopes || resetSeasonEstimates ? " " : ""}${hiddenDuplicates} doublon(s) provider sont masqués du plan ; aucune donnée ni saison n’est supprimée.` : ""} Enregistre pour confirmer.`);
    setStatus("idle");
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateCompetition = (id, patch) => setPlan((current) => ({ ...current, competitions: { ...current.competitions, [id]: { ...current.competitions[id], ...patch } } }));
  const updateCompetitionSeason = (id, season, patch) => setPlan((current) => ({ ...current, competitions: { ...current.competitions, [id]: { ...current.competitions[id], seasons: { ...current.competitions[id].seasons, [season]: { ...current.competitions[id].seasons[season], ...patch } } } } }));
  const updateNational = (id, patch) => setPlan((current) => ({ ...current, nationalTeams: { ...current.nationalTeams, [id]: { ...current.nationalTeams[id], ...patch } } }));
  const updateNationalSeason = (id, season, patch) => setPlan((current) => ({ ...current, nationalTeams: { ...current.nationalTeams, [id]: { ...current.nationalTeams[id], seasons: { ...current.nationalTeams[id].seasons, [season]: { ...current.nationalTeams[id].seasons[season], ...patch } } } } }));
  const updateSeason = (label, patch) => setPlan((current) => ({ ...current, seasons: current.seasons.map((season) => season.label === label ? { ...season, ...patch } : season) }));
  // Saison ajoutée : désactivée partout, conservée seulement après « Enregistrer le plan ».
  const [newSeason, setNewSeason] = useState("");
  const addSeason = () => {
    const result = addImportSeason(plan, newSeason);
    if (result.error) { setStatus("error"); setMessage(result.error); return; }
    setPlan(result.plan); setNewSeason(""); setStatus("idle");
    setMessage(`Saison ${newSeason.trim()} ajoutée, désactivée partout. Active-la puis enregistre le plan pour l’utiliser.`);
  };
  const removeSeason = (label) => {
    const result = removeImportSeason(plan, label);
    if (result.error) { setStatus("error"); setMessage(result.error); return; }
    setPlan(result.plan); setStatus("idle"); setMessage(`Saison ${label} retirée du plan (à enregistrer).`);
  };
  const seasonSpan = plan.seasons.length ? `${plan.seasons[0].label.slice(0, 4)} → ${plan.seasons[plan.seasons.length - 1].label.slice(5, 9)}` : "";

  const save = async () => {
    setStatus("saving"); setMessage("");
    const storedPlan = { ...plan, version: 4 };
    delete storedPlan.legacySeason;
    try {
      await updateSiteSettings(supabase, { football_import_plan: storedPlan }, { expected: { football_import_plan: loadedPlan.current } });
      loadedPlan.current = storedPlan;
      setStatus("saved");
      setMessage("Plan historique et whitelist enregistrés. Aucun appel API n’a été lancé.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || String(error));
    }
  };

  const estimate = useMemo(() => importPlanEstimate(plan), [plan]);
  const schedule = useMemo(() => importPlanSchedule(plan, competitions, nationalTeams), [plan, competitions, nationalTeams]);

  // ── Affichage : recherche, masquées, autorisées seulement ──
  const isCompetitionAllowed = (competition) => Boolean(plan.competitions[competition.id]?.enabled);
  const shownCompetitions = useMemo(() => visibleItems(competitions, {
    query, hidden, showHidden: view.showHidden, onlyAllowed: view.onlyAllowed, isAllowed: isCompetitionAllowed,
    fieldsOf: (competition) => [competition.name, competition.ext?.country, competition.external_id],
  }), [competitions, query, hidden, view, plan.competitions]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownTeams = useMemo(() => visibleItems(nationalTeams.filter((team) => team.external_id), {
    query, hidden, showHidden: view.showHidden, onlyAllowed: view.onlyAllowed,
    idOf: (team) => teamKey(team.external_id), isAllowed: (team) => Boolean(plan.nationalTeams[String(team.external_id)]?.enabled),
  }), [nationalTeams, query, hidden, view, plan.nationalTeams]);
  const hiddenSet = new Set(hidden);
  const hiddenCompetitions = competitions.filter((competition) => hiddenSet.has(String(competition.id)));
  const hiddenTeams = nationalTeams.filter((team) => team.external_id && hiddenSet.has(teamKey(team.external_id)));
  const hiddenCount = hiddenCompetitions.length + hiddenTeams.length;
  const hiddenAllowed = hiddenCompetitions.filter(isCompetitionAllowed).length + hiddenTeams.filter((team) => plan.nationalTeams[String(team.external_id)]?.enabled).length;
  const searching = query.trim().length > 0;
  const scopeBuckets = useMemo(() => groupCompetitionsByScope(
    shownCompetitions,
    (a, b) => (Number(plan.competitions[a.id]?.order) || 999) - (Number(plan.competitions[b.id]?.order) || 999) || a.name.localeCompare(b.name),
  ), [shownCompetitions, plan.competitions]);
  const allowedIn = (rows) => rows.filter(isCompetitionAllowed).length;
  const allGroupIds = PLAN_CATEGORIES.flatMap((category) => [category.key, ...(category.byCountry ? Object.keys(scopeBuckets.etranger).map((country) => `etranger:${country}`) : [])]);
  const setAllGroups = (open) => setOpenGroups((current) => ({ ...current, ...Object.fromEntries(allGroupIds.map((id) => [id, open])) }));
  const groupState = searching ? Object.fromEntries(allGroupIds.map((id) => [id, true])) : openGroups; // recherche : tout ce qui correspond est déplié

  // Carte d'une compétition (case Autoriser + groupe d'ordre + saisons). Réutilisée
  // dans chaque catégorie ET dans les sous-groupes par pays de « Étranger ».
  const renderCompetitionArticle = (competition) => {
    const config = plan.competitions[competition.id];
    if (!config) return null;
    const isHidden = hiddenSet.has(String(competition.id));
    return <article key={competition.id} className={`rounded-xl border border-line/10 bg-surface/70 p-3 ${isHidden ? "opacity-60" : ""}`}><div className="grid gap-3 lg:grid-cols-[auto_minmax(180px,1fr)_180px_80px_auto] lg:items-center"><div className="flex flex-col gap-1.5"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={config.enabled} onChange={(event) => updateCompetition(competition.id, { enabled: event.target.checked })} />Autoriser</label><label className={`flex items-center gap-2 text-[11px] ${config.enabled ? "text-sky-200" : "text-muted opacity-50"}`} title="Nouvelle campagne détectée chaque jour (1 appel) puis importée (résultats et classement), contrôlée et marquée prête — la compétition reste masquée jusqu’à ta publication. Nécessite « Autoriser ». Conseil : niveau « Archive résultats » pour ses saisons, sinon les contrôles exigent aussi compositions et statistiques."><input type="checkbox" checked={config.watch === true && config.enabled} disabled={!config.enabled} onChange={(event) => updateCompetition(competition.id, { watch: event.target.checked })} />Surveiller</label>{config.watch === true && config.enabled && <select aria-label="Niveau d’import des nouvelles campagnes" title="Niveau d’import d’une nouvelle campagne détectée : Saison complète pour une grande compétition (plus d’appels API)." value={config.watch_scope || "base"} onChange={(event) => updateCompetition(competition.id, { watch_scope: event.target.value })} className="rounded-lg border border-line/10 bg-bg px-2 py-1 text-xs">{scopeOptions.map(([key, scope]) => <option key={key} value={key}>{scope.label}</option>)}</select>}</div><div><b className="block text-sm">{competition.name}{competition.public_visible === false && <span className="ml-2 rounded-full border border-line/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted">non publiée</span>}{isHidden && <span className="ml-2 text-[10px] font-normal text-muted">(masquée)</span>}</b><span className="text-[10px] text-muted">{competition.provider} · ID {competition.external_id}{competition.ext?.country ? ` · ${competition.ext.country}` : ""}</span></div><select value={config.group} onChange={(event) => updateCompetition(competition.id, { group: event.target.value })} className="rounded-lg border border-line/10 bg-surface2 px-2 py-2 text-xs">{IMPORT_GROUPS.filter((group) => group.key !== "national").map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}</select><label className="text-[10px] uppercase text-muted">Ordre<input type="number" min="1" value={config.order} onChange={(event) => updateCompetition(competition.id, { order: Number(event.target.value) || 999 })} className="mt-1 w-full rounded border border-line/10 bg-surface2 px-2 py-1 text-sm text-content" /></label><HideButton hidden={isHidden} label={competition.name} onToggle={() => setHidden((current) => toggleInList(current, competition.id))} /></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{plan.seasons.map((season) => <div key={season.label}><div className="mb-1 text-[10px] font-black text-muted">{season.label}</div><SeasonTarget value={config.seasons[season.label]} disabled={!config.enabled || !season.enabled} onChange={(patch) => updateCompetitionSeason(competition.id, season.label, patch)} /></div>)}</div></article>;
  };
  const renderTeamArticle = (team, index) => {
    const externalId = String(team.external_id || "");
    const config = plan.nationalTeams[externalId] || hydrateNationalConfig({}, index);
    const isHidden = hiddenSet.has(teamKey(externalId));
    return <article key={team.id} className={`rounded-xl border border-line/10 bg-surface/70 p-3 ${isHidden ? "opacity-60" : ""}`}><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={config.enabled} disabled={!externalId} onChange={(event) => updateNational(externalId, { enabled: event.target.checked })} />Autoriser</label><div className="min-w-[180px] flex-1"><b className="block text-sm">{team.name}{isHidden && <span className="ml-2 text-[10px] font-normal text-muted">(masquée)</span>}</b><span className="text-[10px] text-muted">ID équipe {externalId || "manquant"}</span></div><label className="text-[10px] uppercase text-muted">Ordre<input type="number" min="1" value={config.order} onChange={(event) => updateNational(externalId, { order: Number(event.target.value) || 999 })} className="mt-1 w-20 rounded border border-line/10 bg-surface2 px-2 py-1 text-sm text-content" /></label><HideButton hidden={isHidden} label={team.name} onToggle={() => setHidden((current) => toggleInList(current, teamKey(externalId)))} /></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{plan.seasons.map((season) => <div key={season.label}><div className="mb-1 text-[10px] font-black text-muted">{season.label}</div><SeasonTarget national value={config.seasons[season.label]} disabled={!config.enabled || !season.enabled} onChange={(patch) => updateNationalSeason(externalId, season.label, patch)} /></div>)}</div></article>;
  };
  const saveButton = <button type="button" onClick={save} disabled={status === "saving" || schedule.capacity <= 0 || schedule.oversized.length > 0} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{status === "saving" ? "Enregistrement…" : "Enregistrer le plan"}</button>;

  return <div>
    <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Mois API-Football Pro</p><h1 className="mt-1 text-2xl font-black">Plan d’import {seasonSpan}</h1><p className="mt-1 max-w-3xl text-sm text-muted">{plan.seasons.length} saisons séparées, une whitelist par compétition et un quota quotidien. Enregistrer ne lance aucun import et n’active jamais une saison automatiquement. L’activation des saisons et l’entretien des données ont leurs propres pages dans le menu Synchronisation.</p></div><div className="flex shrink-0 items-center gap-2">{saveButton}<button type="button" onClick={load} disabled={["loading", "saving"].includes(status)} className="rounded-xl border border-line/15 bg-surface p-2 text-muted hover:text-white disabled:opacity-50" title="Actualiser"><RefreshCw className={`h-4 w-4 ${status === "loading" ? "animate-spin" : ""}`} /></button></div></div>

    {message && <div className={`mb-5 rounded-xl border p-3 text-sm ${status === "error" ? "border-red-400/25 bg-red-500/10 text-red-200" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"}`}>{message}</div>}

    <Group id="budget" openGroups={openGroups} setOpenGroups={setOpenGroups} defaultOpen className="mb-6 bg-surface" header={<><b className="block">Saisons et budget</b><span className="text-[11px] text-muted">{plan.seasons.filter((season) => season.enabled).length}/{plan.seasons.length} saison(s) active(s) · quota {plan.apiBudget} / jour · {estimate.imports} appels historiques estimés</span></>}>
      <div className="p-4">
        <div className="grid gap-3 md:grid-cols-3">{plan.seasons.map((season) => <label key={season.label} className={`rounded-xl border p-3 ${season.enabled ? "border-accent/25 bg-accent/5" : "border-line/10 opacity-60"}`}><span className="flex items-center justify-between gap-2"><b>{season.label}</b><input type="checkbox" checked={season.enabled} onChange={(event) => updateSeason(season.label, { enabled: event.target.checked })} /></span><span className="mt-1 block text-[11px] text-muted">{season.role === ADDED_SEASON_ROLE ? "Saison ajoutée : désactivée partout tant qu’elle n’est pas activée" : season.role === "rollout" ? "Saison à activer progressivement" : "Archive conservée et consultable"}</span><strong className="mt-3 block text-xl">≈ {estimate.bySeason[season.label] || 0}</strong><span className="text-[10px] text-muted">appels planifiés</span>{season.role === ADDED_SEASON_ROLE && <button type="button" onClick={(event) => { event.preventDefault(); removeSeason(season.label); }} className="mt-2 block text-[11px] font-semibold text-red-300 hover:underline">Retirer du plan</button>}</label>)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><label className="text-xs text-muted" htmlFor="import-plan-new-season">Ajouter une saison</label><input id="import-plan-new-season" value={newSeason} onChange={(event) => setNewSeason(event.target.value)} placeholder="2027-2028" className="w-32 rounded-lg border border-line/10 bg-surface2 px-3 py-1.5 text-sm text-content" /><button type="button" onClick={addSeason} disabled={!newSeason.trim()} className="rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-bold text-accent disabled:opacity-50">Ajouter</button><span className="text-[11px] text-muted">Désactivée partout par défaut ; rien n’est importé.</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
          ["apiBudget", "Quota quotidien", 1], ["careerReserve", "Réserve carrières / jour", 0], ["liveReserve", "Réserve direct / jour", 0],
        ].map(([key, label, min]) => <label key={key} className="text-xs text-muted">{label}<input type="number" min={min} max="50000" value={plan[key]} onChange={(event) => setPlan((current) => ({ ...current, [key]: Math.max(min, Number(event.target.value) || 0) }))} className="mt-1 block w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm text-content" /></label>)}<div className="rounded-xl border border-line/10 bg-bg/35 p-3"><b className="block text-xl">{estimate.imports}</b><span className="text-[10px] text-muted">appels historiques estimés</span></div><div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3"><b className="block text-xl text-emerald-300">{schedule.days.length}</b><span className="text-[10px] text-muted">journée{schedule.days.length > 1 ? "s" : ""} d’import prévue{schedule.days.length > 1 ? "s" : ""}</span></div></div>
        <p className="mt-3 text-[11px] leading-5 text-muted">Capacité quotidienne réservée aux imports historiques : {estimate.usableDaily} appels après {estimate.reserved} appels gardés pour les carrières et le direct. Projection haute : calendrier = 3 appels par compétition ; effectifs = jusqu’à 3 pages par club + entraîneur ; complet = jusqu’à 3 appels par match. Le préflight recalculera le coût réel avant chaque lancement.</p>
      </div>
    </Group>

    <section className="mb-6 rounded-2xl border border-line/10 bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">Compétitions par territoire</h2><p className="text-xs text-muted">Belgique, Europe et international sont séparés sans modifier l’ordre réel des imports.</p></div>{saveButton}</div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SearchField value={query} onChange={setQuery} placeholder="Rechercher une compétition, un pays, un ID…" />
        <ToggleChip checked={view.onlyAllowed} onChange={(onlyAllowed) => setView((current) => ({ ...current, onlyAllowed }))} title="N’afficher que les cibles autorisées">Autorisées seulement</ToggleChip>
        <ToggleChip checked={view.showHidden} onChange={(showHidden) => setView((current) => ({ ...current, showHidden }))} title="Afficher aussi ce que tu as masqué">Afficher les masquées ({hiddenCount})</ToggleChip>
        <button type="button" onClick={() => setAllGroups(true)} className="rounded-lg border border-line/15 px-3 py-2 text-xs font-bold text-muted hover:text-content">Tout déplier</button>
        <button type="button" onClick={() => setAllGroups(false)} className="rounded-lg border border-line/15 px-3 py-2 text-xs font-bold text-muted hover:text-content">Tout replier</button>
      </div>
      <p className="mb-4 text-[11px] text-muted">{shownCompetitions.length + shownTeams.length} cible(s) affichée(s) sur {competitions.length + nationalTeams.filter((team) => team.external_id).length}.{hiddenCount > 0 && ` ${hiddenCount} masquée(s) par toi (affichage seulement : elles restent dans le plan${hiddenAllowed ? `, dont ${hiddenAllowed} autorisée(s) qui continueront d’être importées` : ""}).`} Le masquage est mémorisé dans ce navigateur.</p>
      <div className="space-y-3">{PLAN_CATEGORIES.map((category) => {
        // « Étranger » : rangé par pays. Autres catégories : liste à plat.
        const countries = category.byCountry ? Object.keys(scopeBuckets.etranger).sort((a, b) => a.localeCompare(b)) : [];
        const rows = category.byCountry ? [] : (scopeBuckets[category.key] || []);
        const categoryRows = category.byCountry ? countries.flatMap((country) => scopeBuckets.etranger[country]) : rows;
        const teams = category.key === "international" ? shownTeams : [];
        const count = categoryRows.length + teams.length;
        if (!count && (searching || view.onlyAllowed)) return null;
        const allowed = allowedIn(categoryRows) + teams.filter((team) => plan.nationalTeams[String(team.external_id)]?.enabled).length;
        return <Group key={category.key} id={category.key} openGroups={groupState} setOpenGroups={setOpenGroups} defaultOpen={category.key === "belgique"} className="bg-bg/25" header={<span className="flex items-center gap-3"><span className="text-xl">{category.icon}</span><span className="min-w-0 flex-1"><b className="block">{category.label}</b><span className="block truncate text-[11px] text-muted">{category.description}</span></span><span className="rounded-full border border-line/10 bg-surface px-2.5 py-1 text-[10px] font-bold text-muted">{allowed} autorisée(s) / {count}</span></span>}>
          <div className="space-y-3 p-3">
            {category.byCountry
              ? countries.map((country) => <Group key={country} id={`etranger:${country}`} openGroups={groupState} setOpenGroups={setOpenGroups} className="bg-surface/40" header={<span className="flex items-center gap-2"><span className="text-[11px] font-black uppercase tracking-[.16em] text-muted">{country}</span><span className="rounded-full border border-line/10 bg-surface px-2 py-0.5 text-[9px] font-bold text-muted">{allowedIn(scopeBuckets.etranger[country])} / {scopeBuckets.etranger[country].length}</span></span>}><div className="space-y-3 p-3">{scopeBuckets.etranger[country].map(renderCompetitionArticle)}</div></Group>)
              : rows.map(renderCompetitionArticle)}
            {teams.length > 0 && <div className="space-y-3"><div className="px-1 pt-1 text-[10px] font-black uppercase tracking-[.16em] text-muted">Sélections belges suivies</div>{teams.map(renderTeamArticle)}</div>}
            {!count && <p className="rounded-xl border border-dashed border-line/15 p-4 text-sm text-muted">Aucune compétition affichée dans cette catégorie.</p>}
          </div>
        </Group>;
      })}</div>
    </section>

    <Group id="schedule" openGroups={openGroups} setOpenGroups={setOpenGroups} className="mb-6 border-accent/20 bg-accent/5" header={<span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-accent" /><b className="text-sm uppercase tracking-wider text-accent">Ordre quotidien autorisé</b><span className="text-[11px] text-muted">{schedule.days.length} journée(s)</span></span>}>
      <div className="p-4">{schedule.days.length ? <div className="space-y-4">{schedule.days.map((day) => <div key={day.day}><h3 className="mb-2 text-xs font-black">Jour {day.day} · ≈ {day.cost} / {schedule.capacity} appels d’import</h3><ol className="space-y-1.5">{day.targets.map((target, index) => <li key={`${target.type}-${target.id}-${target.season}`} className="flex items-center gap-3 rounded-lg border border-line/10 bg-surface px-3 py-2 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-xs font-black text-accent">{index + 1}</span><span className="flex-1 font-bold">{target.season} · {target.label}</span><span className="text-[10px] uppercase text-muted">≈ {target.cost} · {IMPORT_SCOPES[target.scope]?.label} · {groupLabel[target.group] || target.group}</span></li>)}</ol></div>)}</div> : <p className="text-sm text-muted">Aucune cible autorisée. Tous les imports seront bloqués après enregistrement.</p>}</div>
    </Group>
    {schedule.capacity <= 0 && <div className="mb-3 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-200">Les réserves carrières et direct utilisent tout le quota quotidien. Réduis-les avant d’enregistrer.</div>}
    {schedule.oversized.length > 0 && <div className="mb-3 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-200">Une cible dépasse à elle seule la capacité quotidienne : {schedule.oversized.map((target) => `${target.season} · ${target.label} (≈ ${target.cost})`).join(", ")}. Réduis son périmètre ou augmente le quota avant d’enregistrer.</div>}

    <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Les projections sont volontairement hautes et réparties sur plusieurs journées si nécessaire. Le préflight basé sur les données déjà importées donnera le coût précis avant chaque pipeline.</p></div>
  </div>;
}
