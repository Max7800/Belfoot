// Onglet « Synchronisations » de l'administration, rangé le 30/10/2026 : l'onglet
// « Jobs » montrait 12 pipelines (24 boutons avec « Simuler »), 11 jobs isolés et 4
// imports ciblés, et « Historique » affichait exactement le même panneau. Depuis
// les passages automatiques (résultats, statistiques, compositions, faits,
// entraîneurs, campagnes, Belges à l'étranger), la plupart des boutons font doublon.
import { JOB_CATALOG, JOB_PIPELINES } from "./jobCatalog";

// Ce qu'on lance encore à la main, en premier.
export const COMMON_PIPELINES = ["setup", "complete-season", "transfers", "scan-leagues"];
export const COMMON_JOBS = ["football.campaign-rollover", "football.league-check"];
// Rattrapages ponctuels (une fois par saison au plus), repliés.
export const CATCHUP_PIPELINES = ["belgian-careers", "belgian-season-stats", "careers-division"];
// Jamais un bouton isolé : lancés par leur pipeline ou par les passages automatiques.
export const PIPELINE_ONLY_JOBS = ["football.transfers", "football.scan-belgians", "football.belgian-season-stats", "football.abroad-follow"];
// Imports ciblés d'une sélection (identifiant d'équipe API).
export const TARGETED_JOBS = ["football.team-test", "football.national-team", "football.find-national-teams", "football.resolve-national-clubs"];

export function syncSections(pipelines = JOB_PIPELINES, catalog = JOB_CATALOG) {
  const byKey = Object.fromEntries(pipelines.map((pipeline) => [pipeline.key, pipeline]));
  const placed = new Set([...COMMON_PIPELINES, ...CATCHUP_PIPELINES]);
  const placedJobs = new Set([...COMMON_JOBS, ...PIPELINE_ONLY_JOBS, ...TARGETED_JOBS]);
  return {
    common: { pipelines: COMMON_PIPELINES.map((key) => byKey[key]).filter(Boolean), jobs: COMMON_JOBS.filter((key) => catalog[key]) },
    catchup: CATCHUP_PIPELINES.map((key) => byKey[key]).filter(Boolean),
    advanced: {
      pipelines: pipelines.filter((pipeline) => !placed.has(pipeline.key)),
      jobs: Object.keys(catalog).filter((key) => !placedJobs.has(key)),
    },
    targeted: TARGETED_JOBS.filter((key) => catalog[key]),
  };
}

const MINUTE = 60000;
const ago = (value, now) => {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return null;
  const minutes = Math.round((now - time) / MINUTE);
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 48 * 60) return `il y a ${Math.round(minutes / 60)} h`;
  return `il y a ${Math.round(minutes / 1440)} j`;
};
const latest = (values) => values.map((value) => Date.parse(value || "")).filter(Number.isFinite).sort((a, b) => b - a)[0] ?? null;

// Santé des automatismes, d'après les traces de site_settings et les derniers jobs.
// Statut : « ok », « warn » (en retard ou partiel) ou « error ».
export function healthItems(data = {}, jobRuns = [], now = Date.now()) {
  const items = [];
  const details = data.football_match_details_last;
  items.push(details?.at
    ? { key: "details", label: "Détails de match (compos, faits)", status: details.failed && details.failed >= details.steps ? "error" : now - Date.parse(details.at) > 45 * MINUTE ? "warn" : "ok", detail: `${details.steps || 0} lot(s), ${details.failed || 0} échec(s) · ${ago(details.at, now)}` }
    : { key: "details", label: "Détails de match (compos, faits)", status: "warn", detail: "aucun passage dédié enregistré" });
  const refreshed = latest(Object.values(data.football_competition_refresh_state || {}));
  items.push({ key: "results", label: "Résultats et classements", status: refreshed && now - refreshed <= 24 * 60 * MINUTE ? "ok" : "warn", detail: refreshed ? `dernière compétition mise à jour ${ago(new Date(refreshed).toISOString(), now)}` : "aucune mise à jour enregistrée" });
  const abroad = data.football_abroad_follow_last;
  items.push(abroad?.at
    ? { key: "abroad", label: "Belges à l'étranger (suivi)", status: abroad.ok === false && !abroad.skipped ? "error" : abroad.skipped || /échec/.test(abroad.detail || "") ? "warn" : now - Date.parse(abroad.at) > 2 * 60 * MINUTE ? "warn" : "ok", detail: `${abroad.skipped || String(abroad.detail || abroad.error || "").slice(0, 120)} · ${ago(abroad.at, now)}` }
    : { key: "abroad", label: "Belges à l'étranger (suivi)", status: "warn", detail: "aucun passage enregistré" });
  const scan = data.football_abroad_follow_state?.scan;
  if (scan) {
    const running = !scan.cycleCompletedAt || Date.parse(scan.cycleCompletedAt) < Date.parse(scan.cycleStartedAt || 0);
    items.push({ key: "scan", label: "Balayage des championnats", status: "ok", detail: running ? `cycle en cours depuis ${ago(scan.cycleStartedAt, now)?.replace("il y a ", "")} (championnat n° ${(Number(scan.leagueIndex) || 0) + 1})` : `dernier cycle terminé ${ago(scan.cycleCompletedAt, now)}` });
  }
  const coaches = latest(Object.values(data.football_coach_refresh_state || {}).map((state) => state?.checkedAt));
  items.push({ key: "coaches", label: "Entraîneurs", status: coaches && now - coaches <= 8 * 24 * 60 * MINUTE ? "ok" : "warn", detail: coaches ? `dernière vérification ${ago(new Date(coaches).toISOString(), now)}` : "aucune vérification enregistrée" });
  const recentErrors = jobRuns.filter((run) => run.status === "error" && now - Date.parse(run.started_at || "") <= 24 * 60 * MINUTE);
  items.push({ key: "errors", label: "Erreurs des dernières 24 h", status: recentErrors.length ? "error" : "ok", detail: recentErrors.length ? `${recentErrors.length} job(s) en erreur, dont ${jobLabel(recentErrors[0].job_key)}` : "aucune" });
  const quota = jobRuns.find((run) => run.quota_remaining != null)?.quota_remaining;
  if (quota != null) items.push({ key: "quota", label: "Quota API-Football restant", status: quota < 500 ? "error" : quota < 1500 ? "warn" : "ok", detail: `≈ ${quota} appels aujourd'hui` });
  return items;
}

export const jobLabel = (key) => JOB_CATALOG[key]?.label || key;

// Lignes lisibles de l'historique : job en clair, compétition, statut, appels, durée.
export function historyRows(jobRuns = [], competitionsById = {}, { errorsOnly = false } = {}) {
  return jobRuns
    .filter((run) => !errorsOnly || run.status === "error")
    .map((run) => {
      const started = Date.parse(run.started_at || "");
      const finished = Date.parse(run.finished_at || "");
      const seconds = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, Math.round((finished - started) / 1000)) : null;
      const competitionId = run.params?.competitionId || run.target_key;
      return {
        id: run.id,
        label: jobLabel(run.job_key),
        competition: competitionsById[competitionId]?.name || (run.target_key === "global" ? "Tous" : null),
        status: run.status,
        calls: run.request_count != null ? `${run.request_count}${run.request_limit ? `/${run.request_limit}` : ""}` : null,
        duration: seconds == null ? null : seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`,
        startedAt: run.started_at,
        detail: run.detail || run.error_message || "",
      };
    });
}

// Pipelines repris tout seuls par les passages automatiques : une ancienne erreur
// n'a rien à reprendre (le balayage des championnats continue dans le suivi des
// Belges à l'étranger depuis le 28/10/2026).
export const AUTO_CONTINUED_PIPELINES = ["scan-leagues"];

// Exécutions à proposer en reprise : la DERNIÈRE de chaque pipeline et cible, si
// elle est en erreur, en pause ou en cours, et ni retirée à la main ni reprise par
// l'automatique. Avant le 30/10/2026, une vieille erreur restait affichée même
// quand une exécution plus récente du même pipeline avait réussi.
export function resumableRuns(runs = []) {
  const latest = new Map();
  for (const run of [...runs].sort((a, b) => (Date.parse(b.started_at || "") || 0) - (Date.parse(a.started_at || "") || 0))) {
    const key = `${run.pipeline_key}|${run.target_key}`;
    if (!latest.has(key)) latest.set(key, run);
  }
  return [...latest.values()].filter((run) => ["error", "paused", "running"].includes(run.status) && !run.dismissed_at && !AUTO_CONTINUED_PIPELINES.includes(run.pipeline_key));
}
