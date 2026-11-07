import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { REFRESH_TIME_BUDGET_MS } from "@/lib/competitionRefresh";

// Vraie route du cron, faux Supabase ; runJob simule la durée réelle d'une
// synchro (10 à 20 s) en avançant l'horloge simulée.
const state = vi.hoisted(() => ({ db: null, runs: [], durationMs: 15000, failOn: null, savesDuringRun: [] }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => state.db }));
vi.mock("@/lib/jobs", () => ({
  runJob: async (key, ctx) => {
    // État déjà enregistré pour les compétitions précédentes AVANT ce lancement ?
    state.savesDuringRun.push(Object.keys(state.db.rows("site_settings")[0].data.football_competition_refresh_state || {}).length);
    state.runs.push({ key, competitionId: ctx.competitionId, teamExternalId: ctx.teamExternalId });
    vi.setSystemTime(Date.now() + state.durationMs);
    if (state.failOn && (state.failOn === ctx.competitionId || state.failOn === ctx.teamExternalId)) throw new Error("échec simulé");
    return key === "football.squads" ? { complete: true } : "ok";
  },
}));
const competitionRoute = await import("@/app/api/cron/competition-refresh/route");
const nationalRoute = await import("@/app/api/cron/national-refresh/route");

const SECRET = "secret-de-test";
const NOW = new Date("2026-10-21T18:00:00Z").getTime();
const comp = (i) => ({ id: `c${i}`, name: `Compétition ${i}`, provider: "apifootball", external_id: String(i), public_visible: true, competition_scope: "europe" });
const season = (i) => ({ id: `s${i}`, competition_id: `c${i}`, label: "2026-2027", import_status: "active", public_active: true });
const plan = (n) => ({ version: 4, seasons: [{ label: "2024-2025", enabled: false }, { label: "2025-2026", enabled: true }, { label: "2026-2027", enabled: true }], competitions: Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, { enabled: true, seasons: { "2026-2027": { enabled: true, scope: "base" } } }])) });
const seed = (n) => createFakeSupabase({
  competitions: Array.from({ length: n }, (_, i) => comp(i)),
  seasons: Array.from({ length: n }, (_, i) => season(i)),
  site_settings: [{ id: 1, data: { football_import_plan: plan(n), autre_reglage: { garde: true } } }],
});
const call = async (route, path) => (await route.GET(new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${SECRET}` } }))).json();
const refreshState = () => state.db.rows("site_settings")[0].data.football_competition_refresh_state || {};

beforeAll(() => { process.env.CRON_SECRET = SECRET; vi.useFakeTimers({ toFake: ["Date"] }); });
afterAll(() => { delete process.env.CRON_SECRET; vi.useRealTimers(); });
beforeEach(() => { vi.setSystemTime(NOW); state.runs = []; state.durationMs = 15000; state.failOn = null; state.savesDuringRun = []; });

describe("competition-refresh — budget de temps (coupure à 60 s)", () => {
  it("aucune nouvelle synchro au-delà du budget : les suivantes sont reportées, pas perdues", async () => {
    state.db = seed(8); // 8 synchros de 15 s = 120 s : la fonction aurait été coupée
    const body = await call(competitionRoute, "/api/cron/competition-refresh");
    const launched = state.runs.filter((r) => r.key === "football.sync").length;
    expect(launched).toBeLessThan(8);
    expect(launched * state.durationMs).toBeLessThanOrEqual(REFRESH_TIME_BUDGET_MS + state.durationMs);
    expect(body.results.postponedForTime).toBe(8 - launched);
  });

  it("état enregistré après CHAQUE réussite (une coupure ne fait plus tout refaire)", async () => {
    state.db = seed(3);
    await call(competitionRoute, "/api/cron/competition-refresh");
    expect(state.savesDuringRun).toEqual([0, 1, 2]);
    expect(Object.keys(refreshState()).sort()).toEqual(["c0", "c1", "c2"]);
  });

  it("passage suivant : les compétitions déjà faites ne sont pas repayées", async () => {
    state.db = seed(8);
    await call(competitionRoute, "/api/cron/competition-refresh");
    const first = state.runs.map((r) => r.competitionId);
    state.runs = [];
    vi.setSystemTime(NOW + 20 * 60000);
    await call(competitionRoute, "/api/cron/competition-refresh");
    const second = state.runs.map((r) => r.competitionId);
    expect(second.some((id) => first.includes(id))).toBe(false);
    expect(new Set([...first, ...second]).size).toBe(first.length + second.length);
  });

  it("un échec n'empêche pas d'enregistrer les réussites ; le reste des réglages est conservé", async () => {
    state.db = seed(3); state.failOn = "c1"; state.durationMs = 1000;
    const body = await call(competitionRoute, "/api/cron/competition-refresh");
    expect(Object.keys(refreshState()).sort()).toEqual(["c0", "c2"]);
    expect(state.db.rows("site_settings")[0].data.autre_reglage).toEqual({ garde: true });
    expect(body.ok).toBe(true);
  });

  it("budget raisonnable : une synchro lancée en fin de budget finit avant 60 s", () => {
    expect(REFRESH_TIME_BUDGET_MS + 20000).toBeLessThan(60000);
  });
});

describe("national-refresh — sélection non autorisée par le plan", () => {
  const teams = [
    { id: "t-w", source: "apifootball", external_id: "1777", name: "Belgium W", team_type: "national", national_category: "women", national_gender: "women", national_followed: true, synced_at: null, locked: false },
    { id: "t-u21", source: "apifootball", external_id: "8183", name: "Belgium U21", team_type: "national", national_category: "u21", national_gender: "men", national_followed: true, synced_at: null, locked: false },
  ];
  const natPlan = { version: 4, seasons: [{ label: "2026-2027", enabled: true }], competitions: {}, nationalTeams: { 1777: { enabled: false, seasons: {} }, 8183: { enabled: true, seasons: { "2026-2027": { enabled: true, scope: "complete" } } } } };

  it("Red Flames non autorisées : écartées sans job ni appel, cron en 200 (plus d'échec à chaque passage)", async () => {
    state.durationMs = 1000;
    state.db = createFakeSupabase({ clubs: teams, site_settings: [{ id: 1, data: { football_import_plan: natPlan } }] });
    const response = await nationalRoute.GET(new Request("http://localhost/api/cron/national-refresh", { headers: { authorization: `Bearer ${SECRET}` } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(state.runs.map((r) => r.teamExternalId)).toEqual(["8183"]);
    expect(body).toMatchObject({ ok: true, refreshed: 1, skipped: 1 });
    expect(body.results.find((r) => r.team === "Belgium W")).toMatchObject({ skipped: true });
  });

  it("toutes les tentatives en échec : toujours 500 (une vraie panne reste visible)", async () => {
    state.durationMs = 1000; state.failOn = "8183";
    state.db = createFakeSupabase({ clubs: teams, site_settings: [{ id: 1, data: { football_import_plan: natPlan } }] });
    const response = await nationalRoute.GET(new Request("http://localhost/api/cron/national-refresh", { headers: { authorization: `Bearer ${SECRET}` } }));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ ok: false, refreshed: 0, skipped: 1 });
  });
});

describe("competition-refresh ?pass=details — démarrage des lots", () => {
  // Lot = compositions + faits ; 5 s chacun ici, soit 10 s par lot (mesuré à ~10 s en production).
  const completePlan = (n) => ({ ...plan(n), competitions: Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, { enabled: true, seasons: { "2026-2027": { enabled: true, scope: "complete" } } }])) });
  it("nouveau lot tant que 40 s ne sont pas écoulées : 5 lots (0, 10, 20, 30, 40 s), aucun au-delà", async () => {
    state.durationMs = 5000;
    state.db = createFakeSupabase({ competitions: Array.from({ length: 8 }, (_, i) => comp(i)), seasons: Array.from({ length: 8 }, (_, i) => season(i)), site_settings: [{ id: 1, data: { football_import_plan: completePlan(8) } }] });
    const body = await call(competitionRoute, "/api/cron/competition-refresh?pass=details");
    expect(state.runs.filter((run) => run.key === "football.lineups")).toHaveLength(5);
    expect(body.elapsedMs).toBeLessThanOrEqual(50000);
  });
});
