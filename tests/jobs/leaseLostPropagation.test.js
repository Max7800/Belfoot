import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { runJob } from "@/lib/jobs";
import { expireAbandonedRuns } from "@/lib/runLease";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Perte de bail PENDANT un job : le job doit s'arrêter avant toute nouvelle
// écriture métier, même quand l'appel qui la détecte est « facultatif » (try/catch
// transformant l'erreur en avertissement) ou traité élément par élément.
// Vrai runJob, faux Supabase, faux fournisseur, horloge simulée. Aucun réseau.
const P = "apifootball";
const T0 = new Date("2026-10-12T10:00:00Z").getTime();
const SEASON = "2025-2026";
const C1 = "c-1";
const MIGRATIONS = ["0004_job_execution_guardrails", "0023_season_safe_sync", "0024_player_team_seasons", "0033_history_foundations", "0034_match_sync_state", "0035_match_team_stats"].map((version) => ({ module: version.startsWith("0004") ? "core" : "football", version }));
const PLAN = { version: 4, seasons: [{ label: SEASON, enabled: true }], competitions: { [C1]: { enabled: true, expected_clubs: 2, expected_matches: 1, seasons: { [SEASON]: { enabled: true, scope: "complete", expected_clubs: 2, expected_matches: 1 } } } }, nationalTeams: {} };

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

// `pausedAt` : nom de l'appel qui se fige AVANT son beforeRequest (le job est
// alors entre deux appels) ; pendant la pause, le bail du job expire.
let pausedAt = null;
// Si faux, fetchStandings répond sans appel compté (isole le site « infos de ligue »).
let standingsUsesApi = true;
let entered;
let release;
const calls = [];
async function apiCall(name, ctx) {
  if (name === pausedAt) { entered.resolve(); await release.promise; }
  await ctx?.requestTracker?.beforeRequest?.(name);
  calls.push(name);
}

function seed(extra = {}) {
  return createFakeSupabase({
    competitions: [{ id: C1, name: "Pro League", source: P, provider: P, external_id: "144", competition_type: "league", competition_scope: "belgique", locked: false, ext: { season: "2025" } }],
    schema_migrations: MIGRATIONS,
    site_settings: [{ id: 1, data: { football_import_plan: PLAN } }],
    ...extra,
  });
}

// Lance le job, attend la pause, fait expirer le bail (3 min plus tard), relâche.
async function runWithExpiry(db, key, ctx) {
  const job = runJob(key, { db, competitionId: C1, season: SEASON, requestLimit: 20, ...ctx }).then(() => null, (error) => error);
  await entered.promise;
  vi.setSystemTime(T0 + 3 * 60000);
  const expired = await expireAbandonedRuns(db);
  release.resolve();
  return { error: await job, expired };
}

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => {
  vi.setSystemTime(T0);
  pausedAt = null;
  standingsUsesApi = true;
  entered = deferred();
  release = deferred();
  calls.length = 0;
  registerProvider({
    key: P,
    async fetchMatches(_c, ctx) { await apiCall("matches", ctx); return [{ external_id: "9001", home_ext: "10", away_ext: "20", home_name: "Club A", away_name: "Club B", status: "scheduled", kickoff: "2026-01-10T15:00:00Z", round: "Regular Season - 1" }]; },
    async fetchClubs(_c, ctx) { await apiCall("clubs", ctx); return [{ external_id: "10", name: "Club A" }, { external_id: "20", name: "Club B" }]; },
    async fetchLeagueInfo(_c, ctx) { await apiCall("leagueInfo", ctx); return { name: "Jupiler Pro League", type: "League", country: "Belgium", flag: null, logo: null, coverage: {} }; },
    async fetchStandings(_c, ctx) { if (standingsUsesApi) await apiCall("standings", ctx); return []; },
    async fetchPlayerCareer(player, ctx) { await apiCall(`career:${player.external_id}`, ctx); return []; },
    async fetchMatchLineups(_m, ctx) { await apiCall("lineups", ctx); return []; },
    async fetchMatchPlayerStats(_m, ctx) { await apiCall("playerStats", ctx); return []; },
    // Statistiques collectives : réponse immédiate, sans appel compté.
    async fetchMatchTeamStats() { return [{ team_ext: "10", stats: {} }]; },
  });
});

describe("syncCompetition : perte de bail dans un appel facultatif", () => {
  it("pendant fetchClubs : arrêt, AUCUN match écrit, aucune complétion de saison", async () => {
    const db = seed();
    pausedAt = "clubs";
    const { error, expired } = await runWithExpiry(db, "football.sync");
    expect(expired.jobs).toBe(1);
    expect(error?.code).toBe("LEASE_LOST");
    expect(calls).toEqual(["matches"]);
    expect(db.rows("matches")).toHaveLength(0);
    expect(db.rows("competitions")[0].ext.full_competition_seasons).toBeUndefined();
    expect(db.rows("job_runs")[0].status).toBe("timeout");
  });

  it("pendant fetchLeagueInfo : arrêt, ni infos de ligue ni complétion de saison écrites", async () => {
    const db = seed();
    pausedAt = "leagueInfo";
    // Aucun appel après les infos de ligue : seul ce site peut empêcher la complétion.
    standingsUsesApi = false;
    const { error } = await runWithExpiry(db, "football.sync");
    expect(error?.code).toBe("LEASE_LOST");
    // Le match a été écrit AVANT la perte de bail (légitime) ; rien après.
    expect(db.rows("matches")).toHaveLength(1);
    const ext = db.rows("competitions")[0].ext;
    expect(ext.providerName).toBeUndefined();
    expect(ext.full_competition_seasons).toBeUndefined();
    expect(db.rows("job_runs")[0].status).toBe("timeout");
  });

  it("pendant fetchStandings : arrêt, aucune complétion de saison écrite", async () => {
    const db = seed();
    pausedAt = "standings";
    const { error } = await runWithExpiry(db, "football.sync");
    expect(error?.code).toBe("LEASE_LOST");
    expect(db.rows("competitions")[0].ext.full_competition_seasons).toBeUndefined();
    expect(db.rows("job_runs")[0].status).toBe("timeout");
  });

  it("sans perte de bail, une erreur facultative reste un simple avertissement (non-régression)", async () => {
    const db = seed();
    registerProvider({
      key: P,
      async fetchMatches(_c, ctx) { await apiCall("matches", ctx); return [{ external_id: "9001", home_ext: "10", away_ext: "20", home_name: "Club A", away_name: "Club B", status: "scheduled", kickoff: "2026-01-10T15:00:00Z", round: "Regular Season - 1" }]; },
      async fetchClubs() { throw new Error("API-Football indisponible (HTTP 503)"); },
      async fetchLeagueInfo() { return null; },
      async fetchStandings() { return []; },
    });
    const result = await runJob("football.sync", { db, competitionId: C1, season: SEASON, requestLimit: 20 });
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("avertissements: clubs: API-Football indisponible");
    expect(db.rows("matches")).toHaveLength(1);
    expect(db.rows("job_runs")[0].status).toBe("ok");
  });
});

describe("syncPlayerCareers : perte de bail au milieu d'un lot", () => {
  it("arrêt immédiat : le joueur suivant n'est ni traité ni marqué en erreur", async () => {
    const db = seed({
      clubs: [{ id: "club-home", source: P, external_id: "260", name: "Club 260", team_type: "first_team", locked: false }],
      matches: [{ id: "m-1", competition_id: C1, home_club_id: "club-home", away_club_id: null, source: P, external_id: "1" }],
      players: [
        { id: "p-a", name: "Joueur A", source: P, external_id: "5001", tracked: true, active: true, club_id: "club-home", career_synced_at: null, career_sync_status: null, locked: false, ext: {} },
        { id: "p-b", name: "Joueur B", source: P, external_id: "5002", tracked: true, active: true, club_id: "club-home", career_synced_at: null, career_sync_status: null, locked: false, ext: {} },
      ],
    });
    pausedAt = "career:5001";
    const { error } = await runWithExpiry(db, "football.player-careers", { batchSize: 5 });
    expect(error?.code).toBe("LEASE_LOST");
    const byId = Object.fromEntries(db.rows("players").map((row) => [row.id, row]));
    // A avait été marqué « running » avant la perte de bail ; il n'est PAS passé en erreur.
    expect(byId["p-a"].career_sync_status).toBe("running");
    // B n'a jamais été touché, ni appelé.
    expect(byId["p-b"].career_sync_status).toBeNull();
    expect(calls).toEqual([]);
    expect(db.rows("job_runs")[0].status).toBe("timeout");
  });
});

describe("syncLineups : perte de bail sur l'un des appels parallèles d'un match", () => {
  it("arrêt avant toute écriture du match : aucune statistique collective, aucun marqueur", async () => {
    const db = seed({
      seasons: [{ id: "s-1", competition_id: C1, label: SEASON }],
      clubs: [{ id: "club-10", source: P, external_id: "10", name: "Club A", team_type: "first_team", locked: false }, { id: "club-20", source: P, external_id: "20", name: "Club B", team_type: "first_team", locked: false }],
      matches: [{ id: "m-1", competition_id: C1, season_id: "s-1", status: "finished", external_id: "9001", kickoff: "2026-01-10T15:00:00Z", home_club_id: "club-10", away_club_id: "club-20", lineups_synced_at: null, player_stats_synced_at: null, team_stats_synced_at: null, source: P, locked: false }],
    });
    pausedAt = "lineups";
    const { error } = await runWithExpiry(db, "football.lineups", { matchCap: 1 });
    expect(error?.code).toBe("LEASE_LOST");
    expect(db.rpcCalls.filter((call) => call.name === "replace_provider_match_team_stats")).toEqual([]);
    expect(db.rows("matches")[0]).toMatchObject({ lineups_synced_at: null, player_stats_synced_at: null, team_stats_synced_at: null });
    expect(db.rows("match_player_stats")).toHaveLength(0);
    expect(db.rows("job_runs")[0].status).toBe("timeout");
  });
});
