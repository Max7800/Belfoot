"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { HIDDEN_COMPETITIONS_KEY, matchesQuery, useViewPrefs } from "@/lib/adminViewPrefs";
import RelinkPanel from "@/components/admin/RelinkPanel";
import { distinctProviderCompetitions, Group, PLAN_COMPETITION_COLUMNS, requestMaintenance, SearchField, ToggleChip } from "@/components/admin/importPlanShared";

// Entretien des données (anciennement au milieu de la page « Plan d'import ») :
// reliaison sans appel API, audit des doublons provider, inventaire et
// archivage d'une saison. Chaque action garde sa simulation et sa confirmation.
export default function DataMaintenancePanel() {
  const [competitions, setCompetitions] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [maintenanceSeasonId, setMaintenanceSeasonId] = useState("");
  const [maintenanceReport, setMaintenanceReport] = useState(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState("idle");
  const [maintenanceCoverage, setMaintenanceCoverage] = useState({});
  const [purgePreview, setPurgePreview] = useState(null);
  const [purgeConfirmation, setPurgeConfirmation] = useState("");
  const [duplicateAudit, setDuplicateAudit] = useState(null);
  const [duplicateAuditStatus, setDuplicateAuditStatus] = useState("idle");
  // Affichage seulement (ce navigateur).
  const [openGroups, setOpenGroups] = useViewPrefs("maintenance-groups", {});
  const [hidden] = useViewPrefs(HIDDEN_COMPETITIONS_KEY, []);
  const [showHidden, setShowHidden] = useState(false);
  const [seasonQuery, setSeasonQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    const [competitionResult, seasonResult] = await Promise.all([
      supabase.from("competitions").select(PLAN_COMPETITION_COLUMNS).not("provider", "is", null).order("name"),
      supabase.from("seasons").select("id,label,competition_id").order("label", { ascending: false }),
    ]);
    const error = competitionResult.error || seasonResult.error;
    if (error) { setLoadError(error.message); setLoading(false); return; }
    const seasonRows = seasonResult.data || [];
    setCompetitions(distinctProviderCompetitions(competitionResult.data || [], seasonRows));
    setSeasons(seasonRows);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const competitionName = useMemo(() => Object.fromEntries(competitions.map((competition) => [competition.id, competition.name])), [competitions]);
  const seasonOptions = useMemo(() => {
    const hiddenIds = new Set(hidden);
    return seasons.filter((season) => (showHidden || !hiddenIds.has(String(season.competition_id))) && matchesQuery([competitionName[season.competition_id], season.label], seasonQuery));
  }, [seasons, hidden, showHidden, seasonQuery, competitionName]);
  // La saison choisie doit rester dans la liste affichée.
  useEffect(() => {
    setMaintenanceSeasonId((current) => current && seasonOptions.some((season) => season.id === current) ? current : seasonOptions[0]?.id || "");
  }, [seasonOptions]);
  // Toute autre saison (choix manuel OU filtre) : rapport et simulation effacés,
  // pour qu'un archivage ne vise jamais une saison autre que celle analysée.
  useEffect(() => {
    setMaintenanceReport(null); setPurgePreview(null); setPurgeConfirmation(""); setMaintenanceStatus("idle");
  }, [maintenanceSeasonId]);

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
    <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Synchronisation</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-black"><Database className="h-5 w-5 text-cyan-300" />Entretien des données</h1><p className="mt-1 max-w-3xl text-sm text-muted">Outils de réparation et d’archivage. Chaque action commence par un aperçu qui n’écrit rien, puis demande une confirmation explicite ; les écritures sont journalisées.</p></div><button type="button" onClick={load} disabled={loading} className="rounded-xl border border-line/15 bg-surface p-2 text-muted hover:text-white disabled:opacity-50" title="Actualiser"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div>
    {loadError && <div className="mb-5 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">{loadError}</div>}

    <div className="space-y-4">
      <Group id="relink" openGroups={openGroups} setOpenGroups={setOpenGroups} defaultOpen className="border-sky-400/20 bg-surface" header={<><b className="block">1. Reliaison sans appel API</b><span className="text-[11px] text-muted">Performances sans joueur et matchs sans club, à partir des identifiants déjà enregistrés.</span></>}>
        <div className="p-3"><RelinkPanel /></div>
      </Group>

      <Group id="duplicates" openGroups={openGroups} setOpenGroups={setOpenGroups} className="border-violet-400/20 bg-surface" header={<><b className="block">2. Audit des doublons provider</b><span className="text-[11px] text-muted">Fiches ayant le même ID API. Lecture seule : rien n’est fusionné ni supprimé.</span></>}>
        <div className="p-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] leading-5 text-muted">Compare les fiches ayant le même ID API, leurs saisons et leurs matchs.</p><button type="button" onClick={analyzeDuplicates} disabled={duplicateAuditStatus === "loading"} className="inline-flex items-center gap-2 rounded-lg border border-violet-300/25 bg-violet-400/10 px-3 py-2 text-xs font-bold text-violet-100 disabled:opacity-50"><Search className={`h-3.5 w-3.5 ${duplicateAuditStatus === "loading" ? "animate-pulse" : ""}`} />{duplicateAuditStatus === "loading" ? "Audit…" : "Auditer maintenant"}</button></div>{duplicateAudit?.error && <p className="mt-3 text-xs text-red-200">{duplicateAudit.error}</p>}{duplicateAudit && !duplicateAudit.error && <div className="mt-3 space-y-2 text-xs"><div className="rounded-lg border border-line/10 bg-bg/30 p-2.5"><b>{duplicateAudit.duplicates?.length || 0} doublon(s) de compétition détecté(s)</b><span className="ml-2 text-muted">et {duplicateAudit.belgianSelections?.length || 0} sélection(s) belges présentes.</span></div>{duplicateAudit.duplicates?.map((group) => <div key={group.key} className="overflow-hidden rounded-lg border border-amber-400/20"><div className="bg-amber-400/[0.06] px-3 py-2 font-bold text-amber-100">ID API {group.externalId} · {group.provider}</div>{group.rows.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/10 px-3 py-2"><b>{row.name}</b><span className="text-muted">{row.matches} matchs · {row.seasons.map((season) => season.label).join(", ") || "aucune saison"}</span>{row.publicVisible && <span className="text-emerald-300">public</span>}</div>)}</div>)}{duplicateAudit.belgianSelections?.length > 0 && <div className="rounded-lg border border-sky-400/20 bg-sky-400/[0.05] p-2.5"><b className="text-sky-100">Sélections belges détectées :</b><span className="ml-2 text-muted">{duplicateAudit.belgianSelections.map((team) => `${team.name} (${team.category}${team.followed ? ", suivie" : ""})`).join(" · ")}</span></div>}</div>}</div>
      </Group>

      <Group id="season-archive" openGroups={openGroups} setOpenGroups={setOpenGroups} className="border-cyan-400/20 bg-surface" header={<><b className="block">3. Inventaire et archivage d’une saison</b><span className="text-[11px] text-muted">Niveau de suivi par club, puis simulation obligatoire avant tout archivage.</span></>}>
        <div className="p-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchField value={seasonQuery} onChange={setSeasonQuery} placeholder="Filtrer les saisons (compétition, année)…" />
            <ToggleChip checked={showHidden} onChange={setShowHidden}>Inclure les masquées</ToggleChip>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row"><select value={maintenanceSeasonId} onChange={(event) => setMaintenanceSeasonId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-line/10 bg-surface2 px-3 py-2 text-sm">{seasonOptions.map((season) => <option key={season.id} value={season.id}>{competitionName[season.competition_id] || "Compétition"} · {season.label}</option>)}</select><button type="button" onClick={analyzeMaintenance} disabled={!maintenanceSeasonId || maintenanceStatus === "loading"} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100 disabled:opacity-50"><Search className={`h-4 w-4 ${maintenanceStatus === "loading" ? "animate-pulse" : ""}`} />{maintenanceStatus === "loading" ? "Analyse…" : "Analyser la saison"}</button></div>
          {maintenanceReport?.error && <div className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">{maintenanceReport.error}</div>}
          {maintenanceReport?.counts && <div className="mt-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{[
            ["Matchs conservés", maintenanceReport.counts.matches], ["Clubs conservés", maintenanceReport.counts.clubs], ["Affectations", maintenanceReport.counts.memberships], ["Événements", maintenanceReport.counts.events], ["Compositions", maintenanceReport.counts.lineups], ["Stats joueurs", maintenanceReport.counts.playerStats], ["Lignes protégées", maintenanceReport.counts.protectedRows],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-line/10 bg-surface/70 p-3"><b className="block text-lg">{value}</b><span className="text-[10px] text-muted">{label}</span></div>)}</div>
            <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100"><b>Protection active.</b> {maintenanceReport.nextStep}<ul className="mt-2 list-disc space-y-1 pl-4 text-muted">{maintenanceReport.safeguards.map((item) => <li key={item}>{item}</li>)}</ul></div>
            {maintenanceReport.clubs?.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border border-line/10"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/10 bg-surface px-3 py-2"><div><b className="text-sm">Niveau par club</b><p className="text-[10px] text-muted">Les suggestions ne deviennent actives qu’après enregistrement.</p></div><button type="button" onClick={saveCoverage} disabled={maintenanceStatus === "loading"} className="rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-bold text-cyan-100 disabled:opacity-50">Enregistrer les niveaux</button></div><div className="max-h-[440px] divide-y divide-line/10 overflow-y-auto">{maintenanceReport.clubs.map((club) => <div key={club.id} className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center"><div className="flex min-w-0 items-center gap-2">{club.logoUrl ? <img src={club.logoUrl} className="h-7 w-7 shrink-0 object-contain" alt="" /> : <span className="h-7 w-7 shrink-0 rounded bg-white/[0.05]" />}<span className="min-w-0"><b className="block truncate text-xs">{club.name}</b><span className="text-[10px] text-muted">{club.trackedPlayers ? `${club.trackedPlayers} Belge(s) suivi(s) · ` : ""}{club.saved ? "choix enregistré" : `suggestion : ${club.suggested}`}{club.archivedAt ? " · archivé" : ""}</span></span></div><select value={maintenanceCoverage[club.id] || club.level} onChange={(event) => { setMaintenanceCoverage((current) => ({ ...current, [club.id]: event.target.value })); setPurgePreview(null); }} className="rounded-lg border border-line/10 bg-surface2 px-2 py-1.5 text-xs"><option value="full">Suivi complet</option><option value="match">Matchs détaillés</option><option value="results">Résultats uniquement</option></select></div>)}</div></div>}
            {maintenanceReport.clubs?.every((club) => club.saved) && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/[0.04] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><b className="text-sm text-red-100">Archivage des données secondaires</b><p className="mt-1 text-[11px] text-muted">Conserve clubs, matchs, scores, événements et joueurs. Retire uniquement les détails provider des clubs en « Résultats uniquement ».</p></div><button type="button" onClick={previewPurge} disabled={maintenanceStatus === "loading"} className="rounded-lg border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100 disabled:opacity-50">Simuler la purge</button></div>{purgePreview && <div className="mt-3 rounded-lg border border-line/10 bg-bg/40 p-3 text-xs"><div className="flex flex-wrap gap-x-4 gap-y-1"><span><b>{purgePreview.clubs}</b> clubs secondaires</span><span><b>{purgePreview.detail_rows}</b> détails supprimables</span><span><b>{purgePreview.memberships_archived}</b> affectations archivables</span></div>{!purgePreview.applied && purgePreview.clubs > 0 && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={purgeConfirmation} onChange={(event) => setPurgeConfirmation(event.target.value)} placeholder={`Recopie : ${maintenanceReport.competition?.name || "compétition"}`} className="min-w-0 flex-1 rounded-lg border border-red-300/20 bg-surface2 px-3 py-2 text-sm" /><button type="button" onClick={applyPurge} disabled={purgeConfirmation !== maintenanceReport.competition?.name || maintenanceStatus === "loading"} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Archiver et purger</button></div>}{purgePreview.applied && <p className="mt-2 font-bold text-emerald-300">Archivage terminé.</p>}</div>}</div>}
          </div>}
        </div>
      </Group>
    </div>
  </div>;
}
