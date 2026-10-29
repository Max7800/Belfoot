import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { resumableRuns } from "@/lib/adminSync";

// 30/10/2026 : trois blocs « En erreur » restaient affichés sans rien à reprendre.
const state = vi.hoisted(() => ({ db: null }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => state.db }));
const { POST } = await import("@/app/api/admin/pipeline-dismiss/route");

const run = (id, pipeline_key, status, started_at, extra = {}) => ({ id, pipeline_key, target_key: "all", status, started_at, heartbeat_at: started_at, request_count: 1, request_limit: 10, params: {}, ...extra });

describe("exécutions proposées en reprise", () => {
  it("seule la dernière de chaque pipeline compte : une erreur suivie d'une réussite disparaît", () => {
    const runs = [run("old", "belgian-season-stats", "error", "2026-10-29T23:30:00Z"), run("new", "belgian-season-stats", "ok", "2026-10-30T09:00:00Z"), run("p", "setup", "paused", "2026-10-30T08:00:00Z", { target_key: "c-1" })];
    expect(resumableRuns(runs).map((item) => item.id)).toEqual(["p"]);
  });
  it("retirée à la main ou reprise par l'automatique (balayage) : masquée ; cibles distinctes gardées", () => {
    const runs = [run("a", "setup", "error", "2026-10-30T08:00:00Z", { target_key: "c-1", dismissed_at: "2026-10-30T10:00:00Z" }), run("b", "scan-leagues", "error", "2026-10-28T20:00:00Z"), run("c", "setup", "error", "2026-10-30T07:00:00Z", { target_key: "c-2" }), run("d", "complete-season", "running", "2026-10-30T10:00:00Z", { target_key: "c-1" })];
    expect(resumableRuns(runs).map((item) => item.id).sort()).toEqual(["c", "d"]);
  });
});

describe("route de retrait", () => {
  const seed = (runs) => {
    const db = createFakeSupabase({ pipeline_runs: runs, job_runs: [], profiles: [{ id: "admin-1", role: "admin" }], audit_log: [] });
    db.auth = { async getUser() { return { data: { user: { id: "admin-1" } }, error: null }; } };
    return db;
  };
  const call = (body, token = "jeton") => POST(new Request("http://localhost/x", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) }));
  it("erreur ou pause : retrait noté dans params, statut et avancement inchangés, action journalisée", async () => {
    state.db = seed([run("r1", "setup", "error", "2026-10-30T08:00:00Z", { params: { season: "2026-2027" }, request_count: 4 })]);
    const response = await call({ pipelineRunId: "r1" });
    expect(response.status).toBe(200);
    const row = state.db.rows("pipeline_runs")[0];
    expect(row).toMatchObject({ status: "error", request_count: 4, params: { season: "2026-2027", dismissed_by: "admin-1" } });
    expect(row.params.dismissed_at).toEqual(expect.any(String));
    expect(state.db.rows("audit_log")).toEqual([expect.objectContaining({ action: "pipeline.dismiss", target_id: "r1" })]);
  });
  it("en cours ou terminée : refus (409) ; inconnue : 404 ; non admin : 403 ; sans jeton : 401", async () => {
    state.db = seed([run("live", "setup", "running", new Date().toISOString()), run("done", "setup", "ok", "2026-10-30T08:00:00Z")]);
    expect((await call({ pipelineRunId: "live" })).status).toBe(409);
    expect((await call({ pipelineRunId: "done" })).status).toBe(409);
    expect((await call({ pipelineRunId: "nope" })).status).toBe(404);
    expect((await call({ pipelineRunId: "live" }, null)).status).toBe(401);
    state.db.rows("profiles")[0].role = "member";
    expect((await call({ pipelineRunId: "done" })).status).toBe(403);
    expect(state.db.rows("pipeline_runs").every((row) => !row.params.dismissed_at)).toBe(true);
  });
});

describe("lecture côté client", () => {
  it("seule la date de retrait sort de params, jamais le jeton de bail", async () => {
    const { PIPELINE_RUN_PUBLIC_COLUMNS } = await import("@/lib/runLease");
    const columns = PIPELINE_RUN_PUBLIC_COLUMNS.split(",");
    expect(columns).toContain("dismissed_at:params->>dismissed_at");
    expect(columns.filter((column) => column.includes("params"))).toEqual(["dismissed_at:params->>dismissed_at"]);
  });
});
