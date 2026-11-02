import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { rosterRefreshDue } from "@/lib/jplHistory";

const state = vi.hoisted(() => ({ db: null, calls: [], rosterResult: null, historyResult: null }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => state.db }));
vi.mock("@/lib/jobs", () => ({ runJob: async (key, ctx) => { state.calls.push({ key, competitionId: ctx.competitionId, season: ctx.season, requestLimit: ctx.requestLimit, ...(ctx.clubBatchSize ? { clubBatchSize: ctx.clubBatchSize } : {}) }); return key === "football.squads" ? (state.rosterResult || { complete: true, progress: { current: 1, total: 1 }, requests: 4 }) : (state.historyResult || { complete: false, progress: { current: 3, total: 12 }, detail: "3/12 joueurs", requests: 5 }); } }));
const { GET } = await import("@/app/api/cron/jpl-history/route");
const request = (token = "secret") => new Request("http://localhost/api/cron/jpl-history", { headers: { authorization: `Bearer ${token}` } });
const seed = (enabled = false) => createFakeSupabase({
  site_settings: [{ id: 1, data: { football_jpl_history_enabled: enabled } }],
  competitions: [{ id: "jpl", provider: "apifootball", external_id: "144", public_visible: true }],
  seasons: [{ id: "s", competition_id: "jpl", label: "2026-2027", import_status: "active", public_active: true }],
});
beforeAll(() => { process.env.CRON_SECRET = "secret"; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => { state.calls = []; state.rosterResult = null; state.historyResult = null; state.db = seed(); });

describe("cron des historiques Pro League", () => {
  it("vérifie les effectifs au moins une fois par semaine et reprend un lot", () => {
    const now = Date.now();
    expect(rosterRefreshDue({}, now)).toBe(true);
    expect(rosterRefreshDue({ completedAt: new Date(now - 3 * 86400000).toISOString() }, now)).toBe(false);
    expect(rosterRefreshDue({ completedAt: new Date(now - 8 * 86400000).toISOString() }, now)).toBe(true);
    expect(rosterRefreshDue({ completedAt: new Date(now).toISOString(), clubIndex: 2 }, now)).toBe(true);
  });
  it("refuse sans secret et reste inactif par défaut", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(await (await GET(request())).json()).toMatchObject({ ok: true, skipped: true });
    expect(state.calls).toEqual([]);
  });
  it("après activation, lance un lot borné sur la saison publiée et mémorise sa progression", async () => {
    state.db = seed(true);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(state.calls).toEqual([{ key: "football.squads", competitionId: "jpl", season: "2026-2027", requestLimit: 4, clubBatchSize: 1 }, { key: "football.division-history", competitionId: "jpl", season: "2026-2027", requestLimit: 5 }]);
    expect(state.db.rows("site_settings")[0].data.football_jpl_history_last).toMatchObject({ ok: true, complete: false, progress: { current: 3, total: 12 } });
  });
  it("refuse une Pro League ambiguë avant tout job", async () => {
    state.db = seed(true);
    state.db.rows("competitions").push({ id: "duplicate", provider: "apifootball", external_id: "144", public_visible: true });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(state.calls).toEqual([]);
    expect(state.db.rows("site_settings")[0].data.football_jpl_history_last.ok).toBe(false);
  });
  it("ne dit pas que tout est terminé pendant la découverte des effectifs", async () => {
    state.db = seed(true);
    state.rosterResult = { complete: false, progress: { current: 1, total: 18 }, requests: 4 };
    state.historyResult = { complete: true, progress: { current: 10, total: 10 }, detail: "10/10 joueurs", requests: 0 };
    const body = await (await GET(request())).json();
    expect(body.complete).toBe(false);
    expect(body.detail).toContain("effectifs en cours");
    expect(state.db.rows("site_settings")[0].data.football_jpl_roster_state).toMatchObject({ clubIndex: 1, season: "2026-2027" });
  });
});
