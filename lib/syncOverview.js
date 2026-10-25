// Vue d'ensemble des synchronisations (panneau d'administration en LECTURE
// SEULE) : construit le tableau de bord à partir des données déjà stockées —
// aucune écriture, aucun appel API. Saison rafraîchie et garde du plan d'import
// identiques à celles des crons (refreshSeasonFor, assertImportTargetAllowed).
import { refreshSeasonFor } from "./competitionRefresh";
import { assertImportTargetAllowed } from "./importPlan";
import { JOB_CATALOG } from "./jobCatalog";

const HOUR = 3600000;
// Mêmes valeurs par défaut que les crons (competition-refresh, national-refresh).
const DEFAULT_COMPETITION_IDLE_HOURS = 20;
const DEFAULT_NATIONAL_IDLE_HOURS = 20;
// Marge avant de signaler un retard (un passage peut reporter une compétition).
const LATE_MARGIN_HOURS = 6;
// Statistiques joueurs : au moins un lot complet attendu chaque semaine.
const STATS_STALE_HOURS = 7 * 24;
export const LOW_QUOTA_THRESHOLD = 1000;

const ageHours = (value, now) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? Math.max(0, (now - time) / HOUR) : null;
};

// Lecteur en mémoire des réglages déjà chargés : la garde du plan est appelée
// telle quelle, sans relire la base.
const settingsReader = (settings) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { data: settings }, error: null }) }) }) }) });
const clampHours = (value, fallback) => { const number = Number(value); return Number.isFinite(number) ? Math.max(6, Math.min(72, number)) : fallback; };

async function allowedBy(db, key, ctx) {
  try { await assertImportTargetAllowed(db, key, ctx, JOB_CATALOG[key]); return true; } catch { return false; }
}

export function currentSeasonLabel(now) {
  const date = new Date(now);
  const start = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${start}-${start + 1}`;
}

// Lectures seules (client administrateur, RLS) : rien n'est écrit.
export async function loadSyncOverviewData(db) {
  const [competitions, seasons, settings, jobRuns, nationalTeams] = await Promise.all([
    db.from("competitions").select("id,name,provider,public_visible,competition_scope").not("provider", "is", null),
    db.from("seasons").select("id,competition_id,label,import_status,public_active"),
    db.from("site_settings").select("data").eq("id", 1).maybeSingle(),
    db.from("job_runs").select("id,job_key,target_key,status,detail,started_at,finished_at,request_count,quota_remaining").order("started_at", { ascending: false }).limit(300),
    db.from("clubs").select("id,name,external_id,national_category,national_gender,national_followed,synced_at").eq("team_type", "national").eq("national_followed", true),
  ]);
  const error = competitions.error || seasons.error || settings.error || jobRuns.error || nationalTeams.error;
  if (error) throw error;
  return { competitions: competitions.data || [], seasons: seasons.data || [], settings: settings.data?.data || {}, jobRuns: jobRuns.data || [], nationalTeams: nationalTeams.data || [] };
}

export async function buildSyncOverview({ competitions = [], seasons = [], settings = {}, jobRuns = [], nationalTeams = [], now = Date.now() } = {}) {
  const db = settingsReader(settings);
  const refreshState = settings.football_competition_refresh_state || {};
  const rolloverState = settings.football_campaign_rollover_state || {};
  const statsState = settings.football_competition_stats_state || {};
  const competitionIdle = clampHours(settings.football_competition_refresh?.refresh_idle_hours, DEFAULT_COMPETITION_IDLE_HOURS);
  const nationalIdle = clampHours(settings.football_national_refresh?.refresh_idle_hours, DEFAULT_NATIONAL_IDLE_HOURS);
  const alerts = [];

  const seasonsByCompetition = new Map();
  for (const season of seasons) {
    if (!seasonsByCompetition.has(season.competition_id)) seasonsByCompetition.set(season.competition_id, []);
    seasonsByCompetition.get(season.competition_id).push(season);
  }

  const competitionRows = (await Promise.all(competitions
    .filter((competition) => competition.public_visible !== false && competition.provider)
    .map(async (competition) => {
      const own = seasonsByCompetition.get(competition.id) || [];
      const active = refreshSeasonFor(own);
      const lastRefresh = refreshState[competition.id] || null;
      const age = ageHours(lastRefresh, now);
      const ctx = { competitionId: competition.id, season: active?.label };
      const allowed = active ? await allowedBy(db, "football.sync", ctx) : false;
      // Statistiques : clubs uniquement, niveau « Archive enrichie » (comme le cron).
      const statsEligible = allowed && competition.competition_scope !== "international" && await allowedBy(db, "football.squads", ctx);
      const stats = statsEligible ? { lastStatsAt: statsState[competition.id]?.lastStatsAt || null, clubIndex: Number(statsState[competition.id]?.clubIndex) || 0 } : null;
      // « Prête » = déjà consultable (archive). Seule une saison PLUS RÉCENTE que
      // la saison par défaut attend une activation (nouvelle campagne).
      const ready = own.filter((season) => season.import_status === "ready" && active && String(season.label).localeCompare(String(active.label)) > 0).map((season) => season.label).sort();
      const rollover = rolloverState[competition.id] || null;
      let status = "ok";
      if (!active) status = "no-season";
      else if (!allowed) status = "not-allowed";
      else if (age === null || age > competitionIdle + LATE_MARGIN_HOURS) status = "late";
      return { id: competition.id, name: competition.name, scope: competition.competition_scope || null, season: active?.label || null, lastRefresh, ageHours: age, allowed, status, readySeasons: ready, rollover, stats };
    })))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));

  for (const row of competitionRows) {
    if (row.status === "late") alerts.push({ level: "warning", text: `${row.name} : ${row.ageHours === null ? "jamais rafraîchie" : `pas de rafraîchissement depuis ${Math.round(row.ageHours)} h`} (saison ${row.season}).` });
    if (row.status === "not-allowed") alerts.push({ level: "warning", text: `${row.name} : saison ${row.season} non autorisée dans le plan d'import, le rafraîchissement automatique l'ignore.` });
    if (row.status === "no-season") alerts.push({ level: "info", text: `${row.name} : aucune saison publiée.` });
    if (row.stats && !row.stats.clubIndex) {
      const statsAge = ageHours(row.stats.lastStatsAt, now);
      if (statsAge === null || statsAge > STATS_STALE_HOURS) alerts.push({ level: "warning", text: `${row.name} : statistiques joueurs ${statsAge === null ? "jamais rafraîchies par le cron" : `non rafraîchies depuis ${Math.round(statsAge / 24)} jours`}.` });
    }
    for (const label of row.readySeasons) alerts.push({ level: "action", text: `${row.name} : nouvelle saison ${label} prête (déjà consultable), à activer comme saison par défaut depuis le plan d'import.` });
    if (row.rollover && row.rollover.ok === false) alerts.push({ level: "warning", text: `${row.name} : dernier renouvellement de campagne en échec (${row.rollover.error || "erreur"}).` });
  }

  const season = currentSeasonLabel(now);
  const nationalRows = (await Promise.all(nationalTeams
    .filter((team) => team.national_followed)
    .map(async (team) => {
      const age = ageHours(team.synced_at, now);
      const allowed = await allowedBy(db, "football.national-team", { teamExternalId: team.external_id, season });
      const status = !allowed ? "not-allowed" : age === null || age > nationalIdle + LATE_MARGIN_HOURS ? "late" : "ok";
      return { id: team.id, name: team.name, category: team.national_category || null, gender: team.national_gender || null, lastSync: team.synced_at || null, ageHours: age, allowed, status };
    })))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "fr"));
  for (const row of nationalRows) if (row.status === "late") alerts.push({ level: "warning", text: `${row.name} : pas de synchronisation depuis ${row.ageHours === null ? "toujours" : `${Math.round(row.ageHours)} h`}.` });

  const recent = jobRuns.filter((run) => { const age = ageHours(run.started_at, now); return age !== null && age <= 24; });
  const byStatus = {};
  for (const run of recent) byStatus[run.status] = (byStatus[run.status] || 0) + 1;
  const calls = recent.reduce((sum, run) => sum + (Number(run.request_count) || 0), 0);
  const latestQuota = [...jobRuns].filter((run) => run.quota_remaining != null).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0]?.quota_remaining ?? null;
  const failures = recent.filter((run) => ["error", "timeout"].includes(run.status)).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const repeated = {};
  for (const run of failures) { const key = `${run.job_key}|${run.target_key}|${run.status}`; repeated[key] = (repeated[key] || 0) + 1; }
  for (const [key, count] of Object.entries(repeated)) {
    if (count < 3) continue;
    const [jobKey, target, status] = key.split("|");
    alerts.push({ level: "warning", text: `${jobKey} (${target}) : ${count} ${status === "timeout" ? "coupures" : "erreurs"} en 24 h.` });
  }
  if (latestQuota != null && latestQuota < LOW_QUOTA_THRESHOLD) alerts.push({ level: "warning", text: `Quota API bas : ${latestQuota} appels restants.` });

  const order = { warning: 0, action: 1, info: 2 };
  return {
    competitions: competitionRows,
    nationalTeams: nationalRows,
    jobs: { total: recent.length, byStatus, calls, latestQuota, failures: failures.slice(0, 15) },
    alerts: alerts.sort((a, b) => order[a.level] - order[b.level]),
  };
}
