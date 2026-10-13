import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { JOB_CATALOG, JOB_PIPELINES } from "@/lib/jobCatalog";
import { JOB_SCOPE_ERROR, JobScopeError, resolveJobScope } from "@/lib/jobScope";

// Périmètre explicite des jobs : aucun job ciblé ne parcourt toute la base parce
// qu'un identifiant manque ou qu'une route contourne le préflight. Vrai runJob,
// vraies routes, faux Supabase, faux fournisseur. Aucun réseau.
const state = vi.hoisted(() => ({ db: null }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => state.db }));
const { runJob } = await import("@/lib/jobs");
const { POST: runPipeline } = await import("@/app/api/admin/run-pipeline/route");
const { POST: jobPreflightRoute } = await import("@/app/api/admin/job-preflight/route");
const { GET: legacyJobRoute } = await import("@/app/api/jobs/[key]/route");

const P = "apifootball";
const SEASON = "2025-2026";
const T0 = new Date("2026-10-13T10:00:00Z").getTime();
const MIGRATIONS = ["0004_job_execution_guardrails", "0005_persistent_pipeline_runs", "0023_season_safe_sync", "0024_player_team_seasons", "0028_followed_national_teams", "0033_history_foundations", "0034_match_sync_state", "0035_match_team_stats", "0036_competition_scope", "0037_player_transfers", "0038_player_national_team", "0026_match_center_live", "0032_season_rollout"].map((version) => ({ module: /^000[45]/.test(version) ? "core" : "football", version }));
const PLAN = { version: 4, seasons: [{ label: SEASON, enabled: true }], competitions: Object.fromEntries(["c-1", "c-2"].map((id) => [id, { enabled: true, expected_clubs: 0, expected_matches: 0, seasons: { [SEASON]: { enabled: true, scope: "complete", expected_clubs: 0, expected_matches: 0 } } }])), nationalTeams: {} };

// Tout appel au fournisseur est compté : un refus ne doit en déclencher AUCUN.
const calls = [];
function countingProvider() {
  const record = (name, value) => async (...args) => { calls.push(name); await args.at(-1)?.requestTracker?.beforeRequest?.(name); return typeof value === "function" ? value(...args) : value; };
  registerProvider({
    key: P,
    fetchMatches: record("fetchMatches", (competition) => (competition.external_id === "144" ? [{ external_id: "9001", home_ext: "10", away_ext: "20", home_name: "Club A", away_name: "Club B", status: "scheduled", kickoff: "2026-01-10T15:00:00Z", round: "Regular Season - 1" }] : [])),
    fetchLiveMatches: record("fetchLiveMatches", []),
    fetchClubs: record("fetchClubs", []),
    fetchLeagueInfo: record("fetchLeagueInfo", null),
    fetchStandings: record("fetchStandings", []),
    fetchSquadPlayers: record("fetchSquadPlayers", []),
    fetchCurrentCoach: record("fetchCurrentCoach", null),
    fetchTeamTransfers: record("fetchTeamTransfers", []),
    fetchPlayerCareer: record("fetchPlayerCareer", []),
    fetchEvents: record("fetchEvents", []),
    fetchMatchLineups: record("fetchMatchLineups", []),
    fetchMatchPlayerStats: record("fetchMatchPlayerStats", []),
    fetchMatchTeamStats: record("fetchMatchTeamStats", []),
    fetchClubById: record("fetchClubById", (id) => ({ external_id: String(id), name: "Belgium U21", logo_url: null, city: null })),
    fetchNationalTeamMatches: record("fetchNationalTeamMatches", []),
    fetchCurrentSquad: record("fetchCurrentSquad", []),
    searchNationalTeams: record("searchNationalTeams", []),
  });
}

const STALE_JOB = { id: "j-stale", job_key: "football.sync", target_key: "c-9", status: "running", heartbeat_at: new Date(T0 - 3600000).toISOString(), started_at: new Date(T0 - 3600000).toISOString(), params: {} };
function seed(extra = {}) {
  const db = createFakeSupabase({
    profiles: [{ id: "admin-1", role: "admin" }],
    competitions: [
      { id: "c-1", name: "Pro League", source: P, provider: P, external_id: "144", competition_type: "league", competition_scope: "belgique", locked: false, live_enabled: true, ext: { season: "2025" } },
      { id: "c-2", name: "Challenger Pro League", source: P, provider: P, external_id: "145", competition_type: "league", competition_scope: "belgique", locked: false, live_enabled: false, ext: { season: "2025" } },
    ],
    schema_migrations: MIGRATIONS,
    site_settings: [{ id: 1, data: { football_import_plan: PLAN } }],
    // Une exécution abandonnée : un refus de périmètre doit précéder même son expiration.
    job_runs: [{ ...STALE_JOB }],
    ...extra,
  });
  db.auth = { async getUser() { return { data: { user: { id: "admin-1" } }, error: null }; } };
  return db;
}
const snapshot = (db) => JSON.stringify(["competitions", "seasons", "matches", "clubs", "players", "job_runs", "pipeline_runs", "site_settings"].map((table) => db.rows(table)));

const COMPETITION_JOBS = Object.keys(JOB_CATALOG).filter((key) => JOB_CATALOG[key].scopes?.includes("competition") && !JOB_CATALOG[key].scopes.includes("live"));

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); process.env.JOBS_SECRET = "secret-de-test"; });
afterAll(() => { vi.useRealTimers(); delete process.env.JOBS_SECRET; });
beforeEach(() => { vi.setSystemTime(T0); calls.length = 0; countingProvider(); });

describe("contrat de périmètre (lib/jobScope.js)", () => {
  it("chaque job du catalogue déclare au moins un périmètre connu", () => {
    for (const [key, entry] of Object.entries(JOB_CATALOG)) {
      expect(entry.scopes?.length, key).toBeGreaterThan(0);
      for (const scope of entry.scopes) expect(["competition", "national", "live", "none", "global"]).toContain(scope);
    }
  });

  it("le périmètre global n'est accepté que par les jobs des pipelines déclarés globaux", () => {
    const globalJobs = new Set(JOB_PIPELINES.filter((pipeline) => pipeline.globalScope).flatMap((pipeline) => pipeline.jobs));
    for (const [key, entry] of Object.entries(JOB_CATALOG)) expect(entry.scopes.includes("global"), key).toBe(globalJobs.has(key));
  });

  it("résolution : identifiant requis, global explicite, direct et recherche", () => {
    expect(resolveJobScope("football.sync", { competitionId: "c-1" })).toBe("competition");
    expect(() => resolveJobScope("football.sync", {})).toThrow(JobScopeError);
    expect(() => resolveJobScope("football.sync", { competitionId: "  " })).toThrow(JobScopeError);
    expect(() => resolveJobScope("football.sync", { globalScope: true })).toThrow("périmètre global n'est pas autorisé");
    expect(resolveJobScope("football.discover-belgians", { globalScope: true })).toBe("global");
    expect(() => resolveJobScope("football.discover-belgians", {})).toThrow(JobScopeError);
    expect(resolveJobScope("football.live-sync", {})).toBe("live");
    expect(resolveJobScope("football.live-sync", { competitionId: "c-1" })).toBe("competition");
    expect(resolveJobScope("football.find-national-teams", {})).toBe("none");
    expect(resolveJobScope("football.national-team", { teamExternalId: "8183", competitionId: "c-1" })).toBe("national");
    expect(() => resolveJobScope("football.national-team", { competitionId: "c-1" })).toThrow(JobScopeError);
  });
});

describe("refus sans identifiant : aucun appel API, aucune écriture", () => {
  for (const key of COMPETITION_JOBS) {
    it(`${key} via runJob, sans compétition`, async () => {
      const db = seed();
      const before = snapshot(db);
      const error = await runJob(key, { db, season: SEASON, teamExternalId: key === "football.team-test" ? "10" : null }).catch((caught) => caught);
      expect(error).toBeInstanceOf(JobScopeError);
      expect(error.code).toBe(JOB_SCOPE_ERROR);
      expect(calls).toEqual([]);
      // Rien n'est écrit, pas même l'expiration de l'exécution abandonnée.
      expect(snapshot(db)).toBe(before);
    });
  }

  for (const [key, file] of [["football.sync", "sync"], ["football.squads", "squads"], ["football.events", "events"], ["football.coaches", "coaches"], ["football.track-belgians", "trackPlayers"], ["football.transfers", "transfers"], ["football.player-careers", "playerCareers"], ["football.lineups", "lineups"], ["football.discover-belgians", "discoverBelgians"]]) {
    it(`${key} appelé DIRECTEMENT (sans runJob) : refus, sans parcourir les compétitions`, async () => {
      const job = (await import(`@/modules/football/jobs/${file}`)).default;
      const db = seed();
      const before = snapshot(db);
      await expect(job.run({ db, season: SEASON })).rejects.toBeInstanceOf(JobScopeError);
      expect(calls).toEqual([]);
      expect(snapshot(db)).toBe(before);
    });
  }

  it("identifiant inexistant : refus par le préflight, aucun appel, aucune trace d'exécution", async () => {
    const db = seed();
    const error = await runJob("football.sync", { db, competitionId: "c-inconnue", season: SEASON }).catch((caught) => caught);
    expect(error.message).toContain("La compétition ciblée est introuvable");
    expect(calls).toEqual([]);
    expect(db.rows("job_runs").map((run) => run.id)).toEqual(["j-stale"]);
  });

  it("globalScope demandé pour un job non global : refus", async () => {
    const db = seed();
    const before = snapshot(db);
    await expect(runJob("football.sync", { db, season: SEASON, globalScope: true })).rejects.toThrow("périmètre global n'est pas autorisé");
    expect(calls).toEqual([]);
    expect(snapshot(db)).toBe(before);
  });
});

describe("périmètres valides (non-régression)", () => {
  it("compétition ciblée : seule cette compétition est synchronisée", async () => {
    const db = seed();
    const c2Before = JSON.stringify(db.rows("competitions").find((row) => row.id === "c-2"));
    const result = await runJob("football.sync", { db, competitionId: "c-1", season: SEASON, requestLimit: 10 });
    expect(result.ok).toBe(true);
    expect(db.rows("matches").map((row) => row.competition_id)).toEqual(["c-1"]);
    expect(JSON.stringify(db.rows("competitions").find((row) => row.id === "c-2"))).toBe(c2Before);
    expect(db.rows("job_runs").find((run) => run.job_key === "football.sync" && run.id !== "j-stale")).toMatchObject({ target_key: "c-1", status: "ok" });
  });

  it("global explicite : la découverte « monde » est autorisée", async () => {
    const db = seed();
    const result = await runJob("football.discover-belgians", { db, season: SEASON, globalScope: true, requestLimit: 10 });
    expect(result.ok).toBe(true);
    expect(db.rows("job_runs").find((run) => run.job_key === "football.discover-belgians")).toMatchObject({ target_key: "global" });
  });

  it("direct sans compétition : seules les compétitions live_enabled sont traitées", async () => {
    const db = seed();
    const result = await runJob("football.live-sync", { db, season: SEASON, requestLimit: 10 });
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("Pro League");
    expect(result.detail).not.toContain("Challenger");
    expect(db.rows("job_runs").find((run) => run.job_key === "football.live-sync")).toMatchObject({ target_key: "live" });
  });

  it("sélection avec une compétition sélectionnée dans l'admin : périmètre et verrou « team:… »", async () => {
    const db = seed();
    await runJob("football.national-team", { db, teamExternalId: "8183", nationalCategory: "u21", competitionId: "c-1", season: "2026-2027", requestLimit: 5 });
    expect(db.rows("job_runs").find((run) => run.job_key === "football.national-team")).toMatchObject({ target_key: "team:8183", status: "ok" });
  });

  it("recherche de sélections : aucun identifiant requis", async () => {
    const db = seed();
    const result = await runJob("football.find-national-teams", { db, season: SEASON, requestLimit: 2 });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["searchNationalTeams"]);
  });
});

describe("routes : aucun contournement du périmètre", () => {
  const admin = (body) => new Request("http://localhost/x", { method: "POST", headers: { authorization: "Bearer jeton-admin-factice" }, body: JSON.stringify(body) });

  it("run-pipeline : un globalScope envoyé par le client sur « weekly » est ignoré, création refusée, aucune exécution créée", async () => {
    state.db = seed();
    const sportBefore = JSON.stringify(["competitions", "seasons", "matches", "clubs", "players"].map((table) => state.db.rows(table)));
    const response = await runPipeline(admin({ pipelineKey: "weekly", season: SEASON, requestLimit: 50, globalScope: true }));
    expect(response.status).toBe(500);
    expect(await response.text()).toMatch(/périmètre manquant|Choisis une compétition/);
    expect(state.db.rows("pipeline_runs")).toEqual([]);
    expect(calls).toEqual([]);
    // Aucune donnée sportive touchée. (La route expire d'abord les exécutions
    // abandonnées : maintenance voulue par la PR 2, indépendante du périmètre.)
    expect(JSON.stringify(["competitions", "seasons", "matches", "clubs", "players"].map((table) => state.db.rows(table)))).toBe(sportBefore);
    expect(state.db.rows("job_runs").map((run) => [run.id, run.status])).toEqual([["j-stale", "timeout"]]);
  });

  it("run-pipeline : le pipeline « monde » déclaré global reste autorisé", async () => {
    state.db = seed();
    const response = await runPipeline(admin({ pipelineKey: "discover-world", season: SEASON, requestLimit: 50 }));
    expect(response.status).toBe(200);
    expect(state.db.rows("pipeline_runs")[0]).toMatchObject({ pipeline_key: "discover-world", target_key: "all" });
  });

  it("job-preflight : le globalScope du client est ignoré (blocage affiché)", async () => {
    state.db = seed();
    const response = await jobPreflightRoute(admin({ key: "football.sync", season: SEASON, globalScope: true }));
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.blockers.join(" ")).toMatch(/périmètre manquant/);
  });

  it("route historique /api/jobs/[key] sans identifiant : refus, aucun appel, aucune écriture", async () => {
    state.db = seed();
    const before = snapshot(state.db);
    const response = await legacyJobRoute(new Request("http://localhost/api/jobs/football.sync?season=2025-2026", { headers: { authorization: "Bearer secret-de-test" } }), { params: Promise.resolve({ key: "football.sync" }) });
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("périmètre manquant");
    expect(calls).toEqual([]);
    expect(snapshot(state.db)).toBe(before);
  });

  it("route historique avec une compétition : exécution normale (non-régression)", async () => {
    state.db = seed();
    const response = await legacyJobRoute(new Request("http://localhost/api/jobs/football.sync?season=2025-2026&competitionId=c-1&requestLimit=10", { headers: { authorization: "Bearer secret-de-test" } }), { params: Promise.resolve({ key: "football.sync" }) });
    expect(response.status).toBe(200);
    expect(state.db.rows("matches")).toHaveLength(1);
  });
});
