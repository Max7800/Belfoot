import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { pickContinuableRun } from "@/lib/adminSync";

// Pipelines continués par le serveur (30/10/2026) : vraie route run-pipeline et vraie
// route cron ; runJob simulé (un lot = 3 appels).
const state = vi.hoisted(() => ({ db: null, jobs: [], result: null }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => state.db }));
vi.mock("@/lib/jobs", () => ({ runJob: async (key, ctx) => { state.jobs.push({ key, requestLimit: ctx.requestLimit, globalScope: ctx.globalScope }); return state.result; } }));
const { GET } = await import("@/app/api/cron/pipeline-continue/route");
const { POST: runPipeline } = await import("@/app/api/admin/run-pipeline/route");

const SECRET = "secret-cron";
const NOW = Date.parse("2026-10-30T12:00:00Z");
const run = (extra = {}) => ({ id: "r1", pipeline_key: "belgian-season-stats", target_key: "all", status: "paused", next_step: 0, steps: ["football.belgian-season-stats"], request_count: 5, request_limit: 1200, heartbeat_at: new Date(NOW - 10 * 60000).toISOString(), started_at: "2026-10-30T09:00:00Z", params: { auto_continue: true, batchSize: 5 }, ...extra });
const seed = (runs) => createFakeSupabase({ pipeline_runs: runs, job_runs: [], site_settings: [{ id: 1, data: {} }] });
const cron = async () => (await GET(new Request("http://localhost/api/cron/pipeline-continue", { headers: { authorization: `Bearer ${SECRET}` } }))).json();
const row = () => state.db.rows("pipeline_runs")[0];

beforeAll(() => { process.env.CRON_SECRET = SECRET; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
afterAll(() => { delete process.env.CRON_SECRET; vi.useRealTimers(); });
beforeEach(() => { state.jobs = []; state.result = { complete: false, requests: 3, progress: { current: 5, total: 200, unit: "joueurs" } }; });

describe("choix de la pause à continuer", () => {
  it("pause marquée, non retirée, sans battement depuis 2 min ; la plus ancienne d'abord", () => {
    const runs = [run({ id: "a", heartbeat_at: new Date(NOW - 60000).toISOString() }), run({ id: "b", heartbeat_at: new Date(NOW - 30 * 60000).toISOString() }), run({ id: "c", heartbeat_at: new Date(NOW - 40 * 60000).toISOString(), params: { auto_continue: false } }), run({ id: "d", heartbeat_at: new Date(NOW - 50 * 60000).toISOString(), params: { auto_continue: true, dismissed_at: "x" } }), run({ id: "e", status: "error", heartbeat_at: new Date(NOW - 60 * 60000).toISOString() })];
    expect(pickContinuableRun(runs, NOW).id).toBe("b");
    expect(pickContinuableRun([runs[0]], NOW)).toBeNull(); // onglet ouvert : il garde la main
    expect(pickContinuableRun([runs[1], run({ id: "f", heartbeat_at: new Date(NOW - 90 * 60000).toISOString() })], NOW).id).toBe("f"); // la plus ancienne
  });
});

describe("passage automatique", () => {
  it("un lot lancé, budget inchangé, nouvelle pause encore continuable ; trace pour la santé", async () => {
    state.db = seed([run()]);
    const body = await cron();
    expect(state.jobs).toEqual([{ key: "football.belgian-season-stats", requestLimit: 1195, globalScope: true }]);
    expect(row()).toMatchObject({ status: "paused", request_count: 8, request_limit: 1200, params: { auto_continue: true } });
    expect(body).toMatchObject({ ok: true, pipeline: "belgian-season-stats", status: "paused" });
    expect(state.db.rows("site_settings")[0].data.football_pipeline_continue_last).toMatchObject({ pipeline: "belgian-season-stats", status: "paused" });
  });
  it("étape terminée d'un pipeline à plusieurs étapes : la suivante reste continuable par le serveur", async () => {
    state.result = { complete: true, requests: 4 };
    // Lancé depuis l'administration, sans drapeau : il est posé au passage d'étape.
    state.db = createFakeSupabase({ pipeline_runs: [run({ pipeline_key: "complete-season", target_key: "c-1", steps: ["football.events", "football.lineups"], params: { competitionId: "c-1", season: "2026-2027" } })], job_runs: [], site_settings: [{ id: 1, data: {} }], profiles: [{ id: "admin-1", role: "admin" }] });
    state.db.auth = { async getUser() { return { data: { user: { id: "admin-1" } }, error: null }; } };
    await runPipeline(new Request("http://localhost/x", { method: "POST", headers: { authorization: "Bearer jeton-admin" }, body: JSON.stringify({ pipelineRunId: "r1", continuation: true }) }));
    expect(state.jobs.map((job) => job.key)).toEqual(["football.events"]);
    expect(row()).toMatchObject({ status: "paused", next_step: 1, params: { auto_continue: true } });
  });
  it("dernier lot : pipeline terminé", async () => {
    state.result = { complete: true, requests: 2 };
    state.db = seed([run()]);
    await cron();
    expect(row().status).toBe("ok");
  });
  it("budget épuisé : pause NON continuable, plus rien ne part ensuite", async () => {
    state.db = seed([run({ request_count: 1200 })]);
    await cron();
    expect(state.jobs).toEqual([]);
    expect(row()).toMatchObject({ status: "paused", params: { auto_continue: false } });
    state.db.rows("pipeline_runs")[0].heartbeat_at = new Date(NOW - 10 * 60000).toISOString();
    expect(await cron()).toMatchObject({ idle: true });
  });
  it("rien à continuer (erreur, pause manuelle, onglet actif) : aucun lot", async () => {
    state.db = seed([run({ status: "error" }), run({ id: "r2", params: { auto_continue: false } }), run({ id: "r3", heartbeat_at: new Date(NOW - 30000).toISOString() })]);
    expect(await cron()).toMatchObject({ ok: true, idle: true });
    expect(state.jobs).toEqual([]);
  });
  it("sans secret : 401", async () => {
    state.db = seed([run()]);
    expect((await GET(new Request("http://localhost/x"))).status).toBe(401);
  });
});

describe("route des pipelines appelée avec le secret serveur", () => {
  const call = (body) => runPipeline(new Request("http://localhost/x", { method: "POST", headers: { authorization: `Bearer ${SECRET}` }, body: JSON.stringify(body) }));
  it("ne crée jamais de pipeline, ne reprend jamais sans continuation (403)", async () => {
    state.db = seed([]);
    expect((await call({ pipelineKey: "belgian-season-stats", requestLimit: 5000 })).status).toBe(403);
    state.db = seed([run()]);
    expect((await call({ pipelineRunId: "r1" })).status).toBe(403);
    expect(state.jobs).toEqual([]);
  });
  it("erreur, pause non marquée ou retirée : refus (409), rien relancé", async () => {
    for (const extra of [{ status: "error" }, { params: { auto_continue: false } }, { params: { auto_continue: true, dismissed_at: "2026-10-30T10:00:00Z" } }]) {
      state.db = seed([run(extra)]);
      expect((await call({ pipelineRunId: "r1", continuation: true })).status).toBe(409);
    }
    expect(state.jobs).toEqual([]);
  });
});

describe("lancé depuis l'administration", () => {
  it("après un lot terminé dans le budget, la pause devient continuable par le serveur", async () => {
    state.db = createFakeSupabase({ pipeline_runs: [run({ params: { batchSize: 5 } })], job_runs: [], site_settings: [{ id: 1, data: {} }], profiles: [{ id: "admin-1", role: "admin" }] });
    state.db.auth = { async getUser() { return { data: { user: { id: "admin-1" } }, error: null }; } };
    const response = await runPipeline(new Request("http://localhost/x", { method: "POST", headers: { authorization: "Bearer jeton-admin" }, body: JSON.stringify({ pipelineRunId: "r1", continuation: true }) }));
    expect(response.status).toBe(200);
    expect(row()).toMatchObject({ status: "paused", params: { auto_continue: true } });
  });
});
