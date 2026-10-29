import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { rawFixture } from "../helpers/apiFootballFixtures";
import realApiFootball from "@/modules/football/apifootball";
import { LEASE_MARGIN_SECONDS, LEASE_MS, LeaseLostError, MAX_FUNCTION_SECONDS, PIPELINE_RUN_PUBLIC_COLUMNS, expireAbandonedRuns, isLeaseExpired, runState, writeOwnedPipeline } from "@/lib/runLease";

// Vraie route run-pipeline et vrai runJob, sur un faux Supabase et un faux
// fournisseur dont chaque appel API peut être suspendu : on contrôle l'ordre
// exact des opérations entre deux instances. Aucun réseau, aucun service réel.
const state = vi.hoisted(() => ({ db: null }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => state.db }));
const { POST } = await import("@/app/api/admin/run-pipeline/route");
const { runJob } = await import("@/lib/jobs");

const P = "apifootball";
const T0 = new Date("2026-10-12T10:00:00Z").getTime();
const SEASON = "2025-2026";
const MIGRATIONS = [["core", "0004_job_execution_guardrails"], ["football", "0023_season_safe_sync"], ["football", "0024_player_team_seasons"], ["football", "0028_followed_national_teams"], ["football", "0036_competition_scope"], ["football", "0038_player_national_team"]].map(([module, version]) => ({ module, version }));
const PLAN = { version: 4, seasons: [{ label: SEASON, enabled: true }], competitions: { "c-1": { enabled: true, expected_clubs: 2, expected_matches: 1, seasons: { [SEASON]: { enabled: true, scope: "complete", expected_clubs: 2, expected_matches: 1 } } } }, nationalTeams: {} };

// Appels API : chacun passe par requestTracker.beforeRequest (comme le vrai
// fournisseur), puis par un « portail » que le test peut retenir.
let gates = {};
let calls = {};
function gateFor(name) {
  calls[name] = (calls[name] || 0) + 1;
  return gates[name]?.(calls[name]) || Promise.resolve();
}
async function apiCall(name, ctx) {
  await ctx?.requestTracker?.beforeRequest?.(name);
  await gateFor(name);
}
function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const match = (id, home, away) => ({ external_id: id, home_ext: home, away_ext: away, home_name: `Club ${home}`, away_name: `Club ${away}`, status: "scheduled", kickoff: "2026-01-10T15:00:00Z", round: "Regular Season - 1" });
const club = (id) => ({ external_id: id, name: `Club ${id}` });
// Données renvoyées par le faux fournisseur (par défaut : un match, deux clubs).
let fixtureMatches = [];
let fixtureClubs = [];

function registerFakeProvider() {
  registerProvider({
    key: P,
    async fetchMatches(_competition, ctx) {
      await apiCall("matches", ctx);
      return fixtureMatches;
    },
    async fetchClubs(_competition, ctx) {
      await apiCall("clubs", ctx);
      return fixtureClubs;
    },
    async fetchLeagueInfo() { return null; },
    async fetchStandings() { return []; },
    async fetchSquadPlayers(club, ctx) { await apiCall(`squad:${club.external_id}`, ctx); return []; },
    async fetchCurrentCoach(club, ctx) { await apiCall(`coach:${club.external_id}`, ctx); return null; },
  });
}

function seed(extra = {}) {
  const db = createFakeSupabase({
    profiles: [{ id: "admin-1", role: "admin" }],
    competitions: [{ id: "c-1", name: "Pro League", source: P, provider: P, external_id: "144", competition_type: "league", competition_scope: "belgique", locked: false, ext: { season: "2025" } }],
    schema_migrations: MIGRATIONS,
    site_settings: [{ id: 1, data: { football_import_plan: PLAN } }],
    ...extra,
  });
  db.auth = { async getUser() { return { data: { user: { id: "admin-1" } }, error: null }; } };
  return db;
}

// Toutes les écritures de pipeline_runs, pour vérifier qu'une instance perdante n'écrit rien.
function recordPipelineWrites(db) {
  const writes = [];
  const from = db.from.bind(db);
  db.from = (table) => {
    const builder = from(table);
    if (table === "pipeline_runs") {
      const update = builder.update.bind(builder);
      builder.update = (patch) => { writes.push(patch); return update(patch); };
    }
    return builder;
  };
  return writes;
}

const post = (body) => POST(new Request("http://localhost/api/admin/run-pipeline", { method: "POST", headers: { authorization: "Bearer jeton-admin-factice", "content-type": "application/json" }, body: JSON.stringify(body) }));
const create = (body = {}) => post({ pipelineKey: "setup", competitionId: "c-1", season: SEASON, requestLimit: 50, ...body });
const resume = (id, body = {}) => post({ pipelineRunId: id, requestLimit: 50, ...body });
const pipelineRow = () => state.db.rows("pipeline_runs")[0];
const at = (ms) => vi.setSystemTime(T0 + ms);
// Laisse avancer les promesses en attente jusqu'à ce qu'une condition soit vraie.
async function until(condition, label) {
  for (let i = 0; i < 500; i++) { if (condition()) return; await new Promise((resolve) => setImmediate(resolve)); }
  throw new Error(`condition jamais atteinte : ${label}`);
}

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => { gates = {}; calls = {}; fixtureMatches = [match("9001", "10", "20")]; fixtureClubs = [club("10"), club("20")]; registerFakeProvider(); at(0); });

describe("bail : cohérence avec les durées maximales des routes", () => {
  it("le bail vaut la durée maximale d'une fonction plus une marge, soit 120 s", () => {
    expect(MAX_FUNCTION_SECONDS).toBe(60);
    expect(LEASE_MARGIN_SECONDS).toBeGreaterThanOrEqual(30);
    expect(LEASE_MS).toBe(120000);
  });

  it("chaque route qui exécute des jobs ou des pipelines déclare maxDuration ≤ durée supposée par le bail", () => {
    const root = path.resolve(__dirname, "../../app/api");
    const routes = [];
    const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.name === "route.js") routes.push(full); } };
    walk(root);
    const executing = routes.filter((file) => /runJob\(|writeOwnedPipeline|from\("pipeline_runs"\)\.(update|insert)/.test(fs.readFileSync(file, "utf8")));
    expect(executing.map((file) => path.relative(root, file).replace(/\\/g, "/")).sort()).toEqual([
      "admin/pipeline-dismiss/route.js", "admin/run-job/route.js", "admin/run-pipeline/route.js", "cron/competition-refresh/route.js", "cron/live-window/route.js", "cron/national-refresh/route.js", "jobs/[key]/route.js",
    ]);
    for (const file of executing) {
      const declared = fs.readFileSync(file, "utf8").match(/export const maxDuration = (\d+);/);
      expect(declared, `${file} doit déclarer maxDuration`).toBeTruthy();
      expect(Number(declared[1]), file).toBeLessThanOrEqual(MAX_FUNCTION_SECONDS);
    }
  });

  it("règle commune : actif jusqu'à 120 s inclus, abandonné au-delà", () => {
    const row = { status: "running", heartbeat_at: new Date(T0).toISOString() };
    expect(isLeaseExpired(row, T0 + LEASE_MS)).toBe(false);
    expect(runState(row, T0 + LEASE_MS)).toBe("active");
    expect(isLeaseExpired(row, T0 + LEASE_MS + 1)).toBe(true);
    expect(runState(row, T0 + LEASE_MS + 1)).toBe("abandoned");
    expect(runState({ ...row, status: "paused" }, T0 + 10 * LEASE_MS)).toBe("paused");
  });
});

describe("expiration des exécutions abandonnées", () => {
  const iso = (ms) => new Date(T0 + ms).toISOString();

  it("job abandonné : timeout avec explication ; job encore actif intact", async () => {
    state.db = seed({ job_runs: [
      { id: "j-old", job_key: "football.sync", target_key: "c-1", status: "running", heartbeat_at: iso(0), started_at: iso(0), params: {} },
      { id: "j-live", job_key: "football.sync", target_key: "c-2", status: "running", heartbeat_at: iso(LEASE_MS), started_at: iso(0), params: {} },
    ] });
    at(LEASE_MS + 1000);
    await expireAbandonedRuns(state.db);
    const [old, live] = state.db.rows("job_runs");
    expect(old).toMatchObject({ status: "timeout", finished_at: iso(LEASE_MS + 1000), detail: expect.stringContaining("bail expiré") });
    expect(live.status).toBe("running");
  });

  it("pipeline abandonné : erreur explicite, date de fin, compteurs réconciliés, progression et historique conservés", async () => {
    state.db = seed({
      pipeline_runs: [{ id: "p-1", pipeline_key: "setup", target_key: "c-1", status: "running", next_step: 1, steps: ["football.sync", "football.squads", "football.coaches"], request_count: 2, request_limit: 50, heartbeat_at: iso(0), started_at: iso(-60000), params: { competitionId: "c-1", _resume: { "football.squads": { competitionIndex: 0, clubIndex: 1 } }, lease_token: "t-old" } }],
      job_runs: [{ id: "j-1", job_key: "football.squads", target_key: "c-1", status: "timeout", request_count: 5, heartbeat_at: iso(0), started_at: iso(0), params: { pipelineRunId: "p-1" } }],
    });
    at(150000);
    const result = await expireAbandonedRuns(state.db);
    expect(result.pipelines).toBe(1);
    expect(pipelineRow()).toMatchObject({
      status: "error", next_step: 1, request_count: 5, finished_at: iso(150000),
      detail: expect.stringMatching(/Pipeline abandonné : aucun battement depuis 150 s \(bail de 120 s dépassé\) pendant l'étape 2\. Progression conservée/),
      params: { competitionId: "c-1", _resume: { "football.squads": { competitionIndex: 0, clubIndex: 1 } }, lease_token: "t-old" },
    });
  });

  it("pipeline encore actif (bail valide) : jamais expiré", async () => {
    state.db = seed({ pipeline_runs: [{ id: "p-1", pipeline_key: "setup", target_key: "c-1", status: "running", next_step: 0, steps: ["football.sync"], heartbeat_at: iso(30000), started_at: iso(0), params: { lease_token: "t" } }] });
    at(30000 + LEASE_MS);
    await expireAbandonedRuns(state.db);
    expect(pipelineRow().status).toBe("running");
  });

  it("intercalage : un battement arrivé entre la lecture et l'expiration empêche l'expiration", async () => {
    state.db = seed({ pipeline_runs: [{ id: "p-1", pipeline_key: "setup", target_key: "c-1", status: "running", next_step: 0, steps: ["football.sync"], heartbeat_at: iso(0), started_at: iso(0), params: { lease_token: "t" } }] });
    at(LEASE_MS + 5000);
    const from = state.db.from.bind(state.db);
    state.db.from = (table) => {
      const builder = from(table);
      if (table === "job_runs") {
        const contains = builder.contains.bind(builder);
        // Juste après la lecture des pipelines à expirer : l'instance bat.
        builder.contains = (...args) => { pipelineRow().heartbeat_at = new Date().toISOString(); return contains(...args); };
      }
      return builder;
    };
    const result = await expireAbandonedRuns(state.db);
    expect(result.pipelines).toBe(0);
    expect(pipelineRow().status).toBe("running");
  });

  it("écriture avec un jeton périmé : refusée, rien n'est modifié", async () => {
    state.db = seed({ pipeline_runs: [{ id: "p-1", status: "running", next_step: 0, heartbeat_at: new Date(T0).toISOString(), params: { lease_token: "t-new" } }] });
    const before = JSON.stringify(state.db.rows("pipeline_runs"));
    await expect(writeOwnedPipeline(state.db, "p-1", "t-old", { status: "error", detail: "écrasement" })).rejects.toBeInstanceOf(LeaseLostError);
    expect(JSON.stringify(state.db.rows("pipeline_runs"))).toBe(before);
  });
});

describe("création et reprise des pipelines", () => {
  it("création normale puis lots enchaînés jusqu'au bout (non-régression)", async () => {
    state.db = seed();
    let response = await create();
    expect(response.status).toBe(200);
    let body = await response.json();
    expect(body.params.lease_token).toBeUndefined();
    while (body.continuationRequired) {
      response = await resume(body.id, { continuation: true });
      expect(response.status).toBe(200);
      body = await response.json();
    }
    expect(pipelineRow()).toMatchObject({ status: "ok", next_step: 3, detail: "Pipeline terminé." });
    expect(calls).toMatchObject({ matches: 1, clubs: 1, "squad:10": 1, "squad:20": 1, "coach:10": 1, "coach:20": 1 });
  });

  it("refus de créer un doublon quand un pipeline est en pause : l'administrateur est invité à le reprendre", async () => {
    state.db = seed({ pipeline_runs: [{ id: "p-1", pipeline_key: "setup", target_key: "c-1", status: "paused", next_step: 1, steps: ["football.sync", "football.squads", "football.coaches"], heartbeat_at: new Date(T0 - 3600000).toISOString(), params: { lease_token: "t" } }] });
    const response = await create();
    expect(response.status).toBe(409);
    expect(await response.text()).toMatch(/en pause pour cette cible \(étape 2\/3\)\. Reprends-le/);
    expect(state.db.rows("pipeline_runs")).toHaveLength(1);
    expect(calls).toEqual({});
  });

  it("refus de créer un doublon quand un pipeline actif a un bail valide", async () => {
    state.db = seed({ pipeline_runs: [{ id: "p-1", pipeline_key: "setup", target_key: "c-1", status: "running", next_step: 0, steps: ["football.sync"], heartbeat_at: new Date(T0 - 30000).toISOString(), params: { lease_token: "t" } }] });
    const response = await create();
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("déjà actif");
    expect(state.db.rows("pipeline_runs")).toHaveLength(1);
  });

  it("reprise refusée tant que le bail est valide ; acceptée une fois expiré", async () => {
    state.db = seed({ pipeline_runs: [{ id: "p-1", pipeline_key: "setup", target_key: "c-1", status: "running", next_step: 3, steps: ["football.sync", "football.squads", "football.coaches"], request_limit: 50, heartbeat_at: new Date(T0).toISOString(), started_at: new Date(T0).toISOString(), params: { competitionId: "c-1", season: SEASON, lease_token: "t-old" } }] });
    at(LEASE_MS);
    const early = await resume("p-1");
    expect(early.status).toBe(409);
    expect(pipelineRow()).toMatchObject({ status: "running", params: { lease_token: "t-old" } });
    at(LEASE_MS + 1000);
    const late = await resume("p-1");
    expect(late.status).toBe(200);
    expect(pipelineRow()).toMatchObject({ status: "ok", detail: "Pipeline terminé." });
    expect(pipelineRow().params.lease_token).not.toBe("t-old");
  });

  it("deux reprises concurrentes (lecture A, lecture B, prise A, prise B) : une seule réussit, la perdante n'écrit rien", async () => {
    state.db = seed({ pipeline_runs: [{ id: "p-1", pipeline_key: "setup", target_key: "c-1", status: "paused", next_step: 3, steps: ["football.sync", "football.squads", "football.coaches"], request_limit: 50, heartbeat_at: new Date(T0).toISOString(), started_at: new Date(T0).toISOString(), params: { competitionId: "c-1", season: SEASON, lease_token: "t-paused" } }] });
    const writes = recordPipelineWrites(state.db);
    // Barrière : aucune prise de possession ne s'exécute avant que les DEUX
    // demandes aient lu le pipeline (pire intercalage pour une lecture puis écriture).
    let reads = 0;
    const bothRead = deferred();
    const from = state.db.from.bind(state.db);
    state.db.from = (table) => {
      const builder = from(table);
      if (table !== "pipeline_runs") return builder;
      const select = builder.select.bind(builder);
      const update = builder.update.bind(builder);
      let isClaim = false;
      builder.select = (columns, ...rest) => { if (columns === "*" && !isClaim) { reads++; if (reads === 2) bothRead.resolve(); } return select(columns, ...rest); };
      builder.update = (patch) => { isClaim = patch.status === "running" && !!patch.params?.lease_token; return update(patch); };
      const then = builder.then.bind(builder);
      builder.then = (resolve, reject) => (isClaim ? bothRead.promise.then(() => then(resolve, reject)) : then(resolve, reject));
      return builder;
    };
    const [a, b] = await Promise.all([resume("p-1"), resume("p-1")]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(await loser.text()).toContain("vient d'être repris par une autre demande");
    expect(writes.filter((patch) => patch.status === "error")).toEqual([]);
    expect(pipelineRow()).toMatchObject({ status: "ok", detail: "Pipeline terminé." });
  });
});

describe("instance obsolète après reprise", () => {
  it("l'ancienne instance, réveillée après la reprise, ne peut plus rien écrire et ne passe jamais le gagnant en erreur", async () => {
    state.db = seed();
    const writes = recordPipelineWrites(state.db);
    // Instance A : bloquée dans son premier appel API (fonction figée).
    const frozen = deferred();
    const entered = deferred();
    gates.matches = (n) => (n === 1 ? (entered.resolve(), frozen.promise) : Promise.resolve());
    const aPromise = create();
    await entered.promise;
    const id = pipelineRow().id;
    const tokenA = pipelineRow().params.lease_token;

    // 3 min sans battement : B expire A et reprend avec un nouveau jeton.
    at(3 * 60000);
    let response = await resume(id);
    let body = await response.json();
    while (body.continuationRequired) { body = await (await resume(id, { continuation: true })).json(); }
    expect(pipelineRow()).toMatchObject({ status: "ok", detail: "Pipeline terminé." });
    const tokenB = pipelineRow().params.lease_token;
    expect(tokenB).not.toBe(tokenA);
    const jobA = state.db.rows("job_runs").find((run) => run.job_key === "football.sync" && run.status === "timeout");
    expect(jobA).toBeTruthy();

    // A se réveille et reçoit une ERREUR provider : elle tenterait d'écrire « error ».
    const writesBefore = writes.length;
    frozen.reject(new Error("API-Football indisponible (HTTP 503)"));
    const aResponse = await aPromise;
    expect(aResponse.status).toBe(409);
    const aText = await aResponse.text();
    expect(aText).not.toContain(tokenA);
    expect(aText).not.toContain(tokenB);
    expect(pipelineRow()).toMatchObject({ status: "ok", detail: "Pipeline terminé." });
    expect(pipelineRow().params.lease_token).toBe(tokenB);
    // A a bien TENTÉ de marquer le pipeline en erreur (une fois) : refusé par le jeton.
    expect(writes.slice(writesBefore)).toEqual([expect.objectContaining({ status: "error", detail: "API-Football indisponible (HTTP 503)" })]);
    expect(jobA.status).toBe("timeout");
  });

  it("l'ancienne instance réveillée avec une RÉPONSE valide s'arrête avant son appel API suivant", async () => {
    state.db = seed();
    const frozen = deferred();
    const entered = deferred();
    gates.matches = (n) => (n === 1 ? (entered.resolve(), frozen.promise) : Promise.resolve());
    const aPromise = create();
    await entered.promise;
    const id = pipelineRow().id;
    at(3 * 60000);
    let body = await (await resume(id)).json();
    while (body.continuationRequired) { body = await (await resume(id, { continuation: true })).json(); }
    const clubsCallsBefore = calls.clubs;

    frozen.resolve();
    const aResponse = await aPromise;
    expect(aResponse.status).toBe(409);
    expect(await aResponse.text()).toMatch(/expiré|repris/);
    // Le battement qui précède l'appel « clubs » est refusé : aucun appel API de plus.
    expect(calls.clubs).toBe(clubsCallsBefore);
    expect(pipelineRow()).toMatchObject({ status: "ok", detail: "Pipeline terminé." });
  });
});

describe("interruption au milieu d'un lot puis récupération", () => {
  it("coupure pendant le 2e club : reprise au 2e club, sans refaire le 1er, compteurs réconciliés", async () => {
    state.db = seed();
    let body = await (await create()).json();
    // Lot 1 : synchro de base, puis le club 10 (un club par lot en pipeline).
    expect(body).toMatchObject({ status: "paused", continuationRequired: true });
    expect(calls["squad:10"]).toBe(1);
    const id = body.id;

    // Lot 2 : la fonction se fige pendant l'appel du club 20 (coupure Vercel).
    const entered = deferred();
    gates["squad:20"] = (n) => (n === 1 ? (entered.resolve(), new Promise(() => {})) : Promise.resolve());
    resume(id, { continuation: true });
    await entered.promise;
    await until(() => pipelineRow().status === "running", "lot 2 en cours");
    const countAtCrash = state.db.rows("job_runs").reduce((sum, run) => sum + (Number(run.request_count) || 0), 0);

    // 3 min plus tard : reprise manuelle.
    at(3 * 60000);
    body = await (await resume(id)).json();
    while (body.continuationRequired) { body = await (await resume(id, { continuation: true })).json(); }
    expect(pipelineRow()).toMatchObject({ status: "ok", next_step: 3 });
    expect(calls["squad:10"]).toBe(1);
    expect(calls["squad:20"]).toBe(2);
    const totalAttempts = state.db.rows("job_runs").reduce((sum, run) => sum + (Number(run.request_count) || 0), 0);
    expect(pipelineRow().request_count).toBeGreaterThanOrEqual(countAtCrash);
    expect(pipelineRow().request_count).toBe(totalAttempts);
    expect(state.db.rows("job_runs").filter((run) => run.status === "timeout")).toHaveLength(1);
  });
});

describe("runJob : battement et fin conditionnels (non-régression des jobs isolés)", () => {
  it("job isolé normal : ok, battement à chaque appel", async () => {
    state.db = seed();
    const result = await runJob("football.sync", { db: state.db, competitionId: "c-1", season: SEASON, requestLimit: 10 });
    expect(result).toMatchObject({ ok: true, complete: true, requests: 2 });
    expect(state.db.rows("job_runs")[0]).toMatchObject({ status: "ok", request_count: 2 });
  });

  it("job encore valide d'un pipeline déjà repris (jeton changé) : arrêt avant tout appel API, pipeline intact", async () => {
    state.db = seed({ pipeline_runs: [{ id: "p-1", pipeline_key: "setup", target_key: "c-1", status: "running", next_step: 0, steps: ["football.sync"], request_count: 0, request_limit: 50, heartbeat_at: new Date(T0).toISOString(), started_at: new Date(T0).toISOString(), params: { lease_token: "t-nouvelle-instance" } }] });
    const before = JSON.stringify(state.db.rows("pipeline_runs"));
    const error = await runJob("football.sync", { db: state.db, competitionId: "c-1", season: SEASON, requestLimit: 10, pipelineRunId: "p-1", pipelineLeaseToken: "t-ancienne-instance" }).catch((caught) => caught);
    expect(error.code).toBe("LEASE_LOST");
    expect(calls).toEqual({});
    expect(JSON.stringify(state.db.rows("pipeline_runs"))).toBe(before);
    expect(state.db.rows("job_runs")[0]).toMatchObject({ status: "error", detail: expect.stringContaining("repris par une autre exécution") });
  });

  it("job expiré pendant son exécution : il s'arrête et ne réécrit jamais son statut", async () => {
    state.db = seed();
    const entered = deferred();
    const frozen = deferred();
    gates.matches = (n) => (n === 1 ? (entered.resolve(), frozen.promise) : Promise.resolve());
    const jobPromise = runJob("football.sync", { db: state.db, competitionId: "c-1", season: SEASON, requestLimit: 10 });
    await entered.promise;
    at(3 * 60000);
    await expireAbandonedRuns(state.db);
    expect(state.db.rows("job_runs")[0].status).toBe("timeout");
    frozen.resolve();
    const error = await jobPromise.catch((caught) => caught);
    expect(error.code).toBe("LEASE_LOST");
    expect(state.db.rows("job_runs")[0].status).toBe("timeout");
    expect(calls.clubs).toBeUndefined();
  });
});

// Barrière d'intercalage : aucune prise de possession de pipeline ne s'exécute
// avant que `expectedReads` demandes aient lu la ligne (lecture A, lecture B,
// prise A, prise B : le pire ordre pour une lecture suivie d'une écriture).
function installClaimBarrier(db, expectedReads = 2) {
  let reads = 0;
  const allRead = deferred();
  const from = db.from.bind(db);
  db.from = (table) => {
    const builder = from(table);
    if (table !== "pipeline_runs") return builder;
    const select = builder.select.bind(builder);
    const update = builder.update.bind(builder);
    let isClaim = false;
    builder.select = (columns, ...rest) => { if (columns === "*" && !isClaim) { reads++; if (reads === expectedReads) allRead.resolve(); } return select(columns, ...rest); };
    builder.update = (patch) => { isClaim = patch.status === "running" && !!patch.params?.lease_token; return update(patch); };
    const then = builder.then.bind(builder);
    builder.then = (resolve, reject) => (isClaim ? allRead.promise.then(() => then(resolve, reject)) : then(resolve, reject));
    return builder;
  };
}

describe("B1 — le jeton ne quitte jamais le serveur", () => {
  it("les colonnes lisibles par le navigateur excluent params (donc lease_token)", () => {
    const columns = PIPELINE_RUN_PUBLIC_COLUMNS.split(",");
    expect(columns).not.toContain("params");
    expect(columns).not.toContain("*");
    // Toutes les colonnes affichées par le panneau Jobs restent disponibles.
    for (const used of ["id", "pipeline_key", "target_key", "status", "next_step", "request_count", "request_limit", "detail", "heartbeat_at", "started_at"]) expect(columns).toContain(used);
  });

  it("aucun code client ne lit pipeline_runs en entier ni sa colonne params", () => {
    const root = path.resolve(__dirname, "../..");
    const files = [];
    const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) { if (!["node_modules", ".next", "api"].includes(entry.name)) walk(full); } else if (/\.(js|jsx)$/.test(entry.name)) files.push(full); } };
    walk(path.join(root, "components"));
    walk(path.join(root, "app"));
    const readers = files.filter((file) => fs.readFileSync(file, "utf8").includes('from("pipeline_runs")'));
    expect(readers.map((file) => path.relative(root, file).replace(/\\/g, "/"))).toEqual(["components/admin/panels.js"]);
    for (const file of readers) {
      const source = fs.readFileSync(file, "utf8");
      const selects = [...source.matchAll(/from\("pipeline_runs"\)\.select\(([^)]*)\)/g)].map((match) => match[1]);
      expect(selects).toEqual(["PIPELINE_RUN_PUBLIC_COLUMNS"]);
    }
  });

  it("aucune réponse de la route (succès, pause, conflit) ne contient le jeton", async () => {
    state.db = seed();
    const bodies = [];
    let response = await create();
    let text = await response.text();
    bodies.push(text);
    let body = JSON.parse(text);
    while (body.continuationRequired) {
      response = await resume(body.id, { continuation: true });
      text = await response.text();
      bodies.push(text);
      body = JSON.parse(text);
    }
    const conflictResponse = await resume(body.id);
    bodies.push(await conflictResponse.text());
    const token = pipelineRow().params.lease_token;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    for (const sent of bodies) {
      expect(sent).not.toContain(token);
      expect(sent).not.toContain("lease_token");
    }
  });
});

describe("B2 — protections sans test jusqu'ici", () => {
  it("fin d'un job expiré SANS nouvel appel API : l'ancienne instance ne peut pas le marquer ok", async () => {
    state.db = seed();
    // Le dernier appel API (clubs) est en vol quand le job expire ; ensuite le job
    // termine son travail sans plus aucun appel, donc sans battement.
    const entered = deferred();
    const frozen = deferred();
    gates.clubs = (n) => (n === 1 ? (entered.resolve(), frozen.promise) : Promise.resolve());
    const jobPromise = runJob("football.sync", { db: state.db, competitionId: "c-1", season: SEASON, requestLimit: 10 });
    await entered.promise;
    at(3 * 60000);
    await expireAbandonedRuns(state.db);
    const expiredDetail = state.db.rows("job_runs")[0].detail;
    frozen.resolve();
    const error = await jobPromise.catch((caught) => caught);
    expect(error.code).toBe("LEASE_LOST");
    expect(error.message).toContain("son résultat n'est pas enregistré");
    // Le job a réellement fini son travail (aucun appel en plus) : seule la fin est refusée.
    expect(calls).toEqual({ matches: 1, clubs: 1 });
    expect(state.db.rows("matches")).toHaveLength(1);
    expect(state.db.rows("job_runs")[0]).toMatchObject({ status: "timeout", detail: expiredDetail });
  });

  it("expiration groupée : un job terminé, en pause ou en erreur n'est jamais passé à timeout", async () => {
    const old = new Date(T0).toISOString();
    state.db = seed({ job_runs: ["ok", "paused", "error", "timeout"].map((status) => ({ id: `j-${status}`, job_key: "football.sync", target_key: "c-1", status, detail: `fini ${status}`, heartbeat_at: old, started_at: old, finished_at: old, params: {} })) });
    at(LEASE_MS * 5);
    const result = await expireAbandonedRuns(state.db);
    expect(result.jobs).toBe(0);
    expect(state.db.rows("job_runs").map((run) => [run.id, run.status, run.detail, run.finished_at])).toEqual(["ok", "paused", "error", "timeout"].map((status) => [`j-${status}`, status, `fini ${status}`, old]));
  });

  for (const [label, params] of [["lease_token absent", { competitionId: "c-1", season: SEASON }], ["lease_token nul", { competitionId: "c-1", season: SEASON, lease_token: null }]]) {
    it(`reprise historique (${label}) par la route : reprise, puis nouveau jeton`, async () => {
      state.db = seed({ pipeline_runs: [{ id: "p-old", pipeline_key: "setup", target_key: "c-1", status: "paused", next_step: 3, steps: ["football.sync", "football.squads", "football.coaches"], request_count: 4, request_limit: 50, heartbeat_at: new Date(T0 - 86400000).toISOString(), started_at: new Date(T0 - 86400000).toISOString(), params }] });
      const response = await resume("p-old");
      expect(response.status).toBe(200);
      expect(pipelineRow()).toMatchObject({ status: "ok", detail: "Pipeline terminé.", params: { competitionId: "c-1", season: SEASON } });
      expect(pipelineRow().params.lease_token).toMatch(/^[0-9a-f-]{36}$/);
    });
  }

  it("reprise historique sans jeton, deux demandes concurrentes : une seule réussit", async () => {
    state.db = seed({ pipeline_runs: [{ id: "p-old", pipeline_key: "setup", target_key: "c-1", status: "error", next_step: 3, steps: ["football.sync", "football.squads", "football.coaches"], request_count: 0, request_limit: 50, heartbeat_at: new Date(T0 - 86400000).toISOString(), started_at: new Date(T0 - 86400000).toISOString(), params: { competitionId: "c-1", season: SEASON } }] });
    installClaimBarrier(state.db, 2);
    const [a, b] = await Promise.all([resume("p-old"), resume("p-old")]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(pipelineRow()).toMatchObject({ status: "ok" });
  });

  it("vrai cycle afterResponse (vrai fournisseur API-Football, fetch simulé) : réponse reçue après expiration jamais exploitée", async () => {
    state.db = seed();
    // Le VRAI fournisseur (apiFull : beforeRequest → fetch → afterResponse → lecture),
    // avec un fetch simulé : aucun réseau.
    registerProvider(realApiFootball);
    const entered = deferred();
    const released = deferred();
    const requested = [];
    vi.stubGlobal("fetch", async (url) => {
      requested.push(String(url));
      entered.resolve();
      await released.promise;
      const body = { response: [rawFixture({ id: 9001, date: "2026-01-10T15:00:00+00:00", season: 2025, leagueId: 144, leagueName: "Pro League", round: "Regular Season - 1", home: { id: 10, name: "Club A" }, away: { id: 20, name: "Club B" } })] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "x-ratelimit-requests-remaining": "7400" } });
    });
    try {
      const jobPromise = runJob("football.sync", { db: state.db, competitionId: "c-1", season: SEASON, requestLimit: 10, apifootballKey: "cle-factice-de-test" });
      await entered.promise;
      expect(state.db.rows("job_runs")[0]).toMatchObject({ status: "running", request_count: 1 });
      at(3 * 60000);
      await expireAbandonedRuns(state.db);
      released.resolve();
      const error = await jobPromise.catch((caught) => caught);
      expect(error.code).toBe("LEASE_LOST");
      // afterResponse a refusé la suite : la réponse n'a produit aucune écriture métier
      // et aucune deuxième requête n'est partie.
      expect(requested).toHaveLength(1);
      expect(requested[0]).toMatch(/^https:\/\/v3\.football\.api-sports\.io\/fixtures\?league=144&season=2025$/);
      expect(state.db.rows("matches")).toHaveLength(0);
      expect(state.db.rows("clubs")).toHaveLength(0);
      expect(state.db.rows("job_runs")[0]).toMatchObject({ status: "timeout", request_count: 1, quota_remaining: null });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// Intercalage « ABA » : les deux demandes lisent le pipeline en pause ; la
// première le reprend, traite un lot ENTIER et le remet en pause ; la seconde
// tente ensuite sa prise de possession avec son état périmé. Le statut est de
// nouveau « paused » : seule la condition sur le jeton peut la refuser.
function installSequencedClaims(db) {
  let reads = 0;
  let claims = 0;
  const bothRead = deferred();
  const firstDone = deferred();
  const from = db.from.bind(db);
  db.from = (table) => {
    const builder = from(table);
    if (table !== "pipeline_runs") return builder;
    const select = builder.select.bind(builder);
    const update = builder.update.bind(builder);
    let claimOrder = 0;
    builder.select = (columns, ...rest) => { if (columns === "*" && !claimOrder) { reads++; if (reads === 2) bothRead.resolve(); } return select(columns, ...rest); };
    builder.update = (patch) => { if (patch.status === "running" && patch.params?.lease_token) claimOrder = ++claims; return update(patch); };
    const then = builder.then.bind(builder);
    builder.then = (resolve, reject) => {
      if (claimOrder === 1) return bothRead.promise.then(() => then(resolve, reject));
      if (claimOrder === 2) return firstDone.promise.then(() => then(resolve, reject));
      return then(resolve, reject);
    };
    return builder;
  };
  return firstDone;
}

describe("B2 — reprise sur un état périmé (ABA)", () => {
  for (const legacy of [true, false]) {
    it(`${legacy ? "pipeline historique sans jeton" : "pipeline avec jeton"} : la demande périmée est refusée après que l'autre a repris, avancé et remis en pause`, async () => {
      fixtureMatches = [match("9001", "10", "20"), match("9002", "30", "10")];
      fixtureClubs = [club("10"), club("20"), club("30")];
      state.db = seed();
      // Lot 1 : synchro de base puis club 10 → pause (point de reprise : club 20).
      const first = await (await create()).json();
      expect(first).toMatchObject({ status: "paused", continuationRequired: true });
      if (legacy) delete pipelineRow().params.lease_token;
      const firstDone = installSequencedClaims(state.db);
      const r1 = resume(first.id, { continuation: true });
      const r2 = resume(first.id, { continuation: true });
      // R1 reprend et traite le club 20, puis remet en pause (point de reprise : club 30).
      const r1Response = await r1;
      expect(r1Response.status).toBe(200);
      expect(await r1Response.json()).toMatchObject({ status: "paused", continuationRequired: true });
      const progress = JSON.stringify(pipelineRow().params._resume);
      const tokenR1 = pipelineRow().params.lease_token;
      firstDone.resolve();
      const r2Response = await r2;
      expect(r2Response.status).toBe(409);
      // La demande périmée n'a ni relancé le club 20, ni écrasé la progression de R1.
      expect(calls["squad:20"]).toBe(1);
      expect(JSON.stringify(pipelineRow().params._resume)).toBe(progress);
      expect(pipelineRow().params.lease_token).toBe(tokenR1);
      expect(pipelineRow().status).toBe("paused");
    });
  }
});
