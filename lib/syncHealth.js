import { RBFA_SOURCES } from "./rbfaSources";
import { FIFA_U17_ARCHIVE_AFTER, FIFA_U17_KEY } from "./fifaTournamentRoster";
import { FIFA_U17_FIXTURES_KEY, FIFA_U17_STAGES, validFifaStage } from "./fifaU17Fixtures";
import { UEFA_U21_DRAW_KEY, UEFA_U21_START, validU21Draw } from "./uefaDraw";
import { upcomingInternationalDraws } from "./internationalDrawWatch";

// États observés, pas promesse qu'un cron est activé ou que toutes les cibles ont tourné.
export function syncHealth(settings = {}, jobs = [], now = Date.now()) {
  function snapshot(label, state, successKey, maxAge, extra = "") {
    const attempted = state?.attemptedAt || null;
    const success = state?.[successKey] || null;
    const successTime = Date.parse(success || "");
    const age = Number.isFinite(successTime) ? now - successTime : Infinity;
    const status = state?.error ? "error" : !Number.isFinite(successTime) || age < -300000 ? "missing" : age > maxAge ? "stale" : "ok";
    return { label, status, attempted, success, error: state?.error || null, extra };
  }
  const monitor = settings.football_rbfa_monitor || {};
  const rows = Object.entries(RBFA_SOURCES).map(([key, source]) => {
    const state = monitor[key];
    const row = snapshot(`RBFA · ${source.title}`, state, "observedAt", 3 * 3600000,
      state?.players ? `${state.players.length} joueurs · ${state.players.filter((p) => p.playerId).length} reliés` : "");
    if (state?.linkError || state?.application?.state === "erreur") { row.status = "error"; row.error = state.linkError || state.application.error || "Erreur d'application"; }
    if (state?.application?.state === "migration_absente" || state?.application?.state === "identites_incompletes") {
      if (row.status === "ok") row.status = "attention";
      row.extra += ` · ${state.application.state.replaceAll("_", " ")}`;
    }
    return row;
  });
  const fifa = settings[FIFA_U17_KEY];
  const archived = now >= FIFA_U17_ARCHIVE_AFTER && fifa?.players?.length === 21;
  const tournament = snapshot("FIFA · Mondial U17 Belgique", fifa, "observedAt", archived ? Infinity : 2 * 86400000,
    `${fifa?.players?.length || 0} joueurs${fifa?.version ? ` · ${fifa.version}` : ""}${archived ? " · archive" : ""}`);
  if (tournament.status === "ok" && (!Array.isArray(fifa?.players) || fifa.players.length !== 21 || !fifa.version)) tournament.status = "missing";
  rows.push(tournament);
  const fixtures = settings[FIFA_U17_FIXTURES_KEY];
  const validStages = Object.keys(FIFA_U17_STAGES).filter((id) => validFifaStage(id, fixtures?.stages?.[id]));
  const fixtureArchived = now >= FIFA_U17_ARCHIVE_AFTER && validStages.length > 0;
  const fixtureRow = snapshot("FIFA · programme Mondial U17", fixtures, "observedAt", fixtureArchived ? Infinity : 2 * 3600000,
    `${validStages.length} phase(s) complète(s)${fixtureArchived ? " · archive" : ""}`);
  if (fixtureRow.status === "ok" && validStages.length === 0) fixtureRow.status = "missing";
  rows.push(fixtureRow);
  const u21 = settings[UEFA_U21_DRAW_KEY];
  const u21Archived = now >= UEFA_U21_START && validU21Draw(u21?.groups);
  const u21Row = snapshot("UEFA · tirage Euro U21 2027", u21, "observedAt", u21Archived ? Infinity : 2 * 86400000,
    u21Archived ? "Tirage conservé · tournoi commencé" : "");
  if (u21Row.status === "ok" && !validU21Draw(u21?.groups)) u21Row.status = "missing";
  rows.push(u21Row);
  const ranking = settings.football_fifa_rankings_auto;
  const rank = snapshot("FIFA · classement mondial", ranking, "checkedAt", 9 * 86400000,
    ranking?.publishedAt ? `Édition du ${ranking.publishedAt.slice(0, 10)} · ${ranking.entries?.length || 0} pays` : "");
  if (settings.football_fifa_rankings_enabled === false) { rank.status = "disabled"; rank.extra = "Synchronisation désactivée"; }
  else if (rank.status === "ok" && (!Array.isArray(ranking?.entries) || ranking.entries.length < 150 || !ranking.entries.some((row) => row.code === "BEL"))) rank.status = "missing";
  rows.push(rank);
  const latestJobs = new Map();
  for (const job of jobs) {
    const key = `${job.job_key}|${job.target_key || ""}`;
    if (!latestJobs.has(key)) latestJobs.set(key, { ...job, last_success_at: null });
    const item = latestJobs.get(key);
    if (!item.last_success_at && job.status === "ok") item.last_success_at = job.finished_at || job.started_at || null;
  }
  return { snapshots: rows, jobs: [...latestJobs.values()], internationalDraws: upcomingInternationalDraws(now, settings) };
}
