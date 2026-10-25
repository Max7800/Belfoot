import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { preflightJobs, requiredMigrationsForJob } from "@/lib/jobPreflight";

// Passage « statistiques » du cron competition-refresh : chaque lot de clubs
// doit passer le VRAI préflight de football.squads. Avant correctif, le
// préflight estimait l'effectif complet (18 clubs × 4 = 72 > budget 12) et
// refusait chaque lot : statistiques joueurs figées en production depuis début
// octobre, sans appel API ni ligne de journal.
const state = vi.hoisted(() => ({ db: null, runs: [] }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => state.db }));
vi.mock("@/lib/jobs", () => ({ runJob: async (key, ctx) => { state.runs.push({ key, ctx }); return key === "football.squads" ? { complete: true } : "ok"; } }));
const { GET } = await import("@/app/api/cron/competition-refresh/route");

const SECRET = "secret-de-test";
const NOW = new Date("2026-10-25T12:00:00Z").getTime();
const H = 3600000;
const CLUBS = Array.from({ length: 18 }, (_, index) => ({ id: `k-${String(index).padStart(2, "0")}`, name: `Club ${index}`, external_id: String(100 + index), source: "apifootball", team_type: "first_team" }));
const MIGRATIONS = [...new Map(["football.squads", "football.coaches", "football.sync"].flatMap((key) => requiredMigrationsForJob(key, "2026-2027")).map((item) => [`${item.module}/${item.version}`, item])).values()];
const plan = { version: 4, seasons: [{ label: "2026-2027", enabled: true }], competitions: { "c-144": { enabled: true, expected_clubs: 18, seasons: { "2026-2027": { enabled: true, scope: "complete", expected_clubs: 18 } } } } };
const matches = CLUBS.slice(0, 9).map((club, index) => ({ id: `m-${index}`, competition_id: "c-144", season_id: "s-26", home_club_id: club.id, away_club_id: CLUBS[17 - index].id, status: "finished", external_id: String(index), kickoff: new Date(NOW - (index + 2) * H).toISOString() }));
const seed = (strategy = null) => createFakeSupabase({
  competitions: [{ id: "c-144", name: "Pro League", provider: "apifootball", external_id: "144", competition_type: "league", competition_scope: "belgique", public_visible: true, ext: {} }],
  seasons: [{ id: "s-26", competition_id: "c-144", label: "2026-2027", import_status: "active", public_active: true }],
  clubs: CLUBS.map((club) => ({ ...club })),
  matches,
  schema_migrations: MIGRATIONS,
  site_settings: [{ id: 1, data: { football_import_plan: plan, football_competition_refresh_state: { "c-144": new Date(NOW - H).toISOString() }, ...(strategy ? { football_competition_refresh: strategy } : {}) } }],
});
const tick = async () => (await GET(new Request("http://localhost/api/cron/competition-refresh", { headers: { authorization: `Bearer ${SECRET}` } }))).json();

beforeAll(() => { process.env.CRON_SECRET = SECRET; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
afterAll(() => { delete process.env.CRON_SECRET; vi.useRealTimers(); });
beforeEach(() => { state.runs = []; });

describe("préflight — lot de clubs", () => {
  const input = (extra = {}) => ({ key: "football.squads", competitionId: "c-144", season: "2026-2027", ...extra });
  it("effectifs : seul le lot est estimé, le préflight accepte le budget du lot", async () => {
    const result = await preflightJobs(seed(), input({ clubBatchSize: 3, requestLimit: 12 }));
    expect(result.total).toEqual({ min: 6, max: 12 });
    expect(result.steps[0].basis).toMatch(/lot de 3 club\(s\) par passage$/);
    expect(result.ok).toBe(true);
  });
  it("sans lot : effectif complet estimé, budget insuffisant refusé (comportement inchangé)", async () => {
    const result = await preflightJobs(seed(), input({ requestLimit: 12 }));
    expect(result.total).toEqual({ min: 36, max: 72 });
    expect(result.blockers).toContain("Le coût maximal estimé (72) dépasse le budget strict (12).");
  });
  it("reprise en fin d'effectif : le lot est borné aux clubs restants", async () => {
    const result = await preflightJobs(seed(), input({ clubBatchSize: 3, requestLimit: 12, resumeState: { competitionIndex: 0, clubIndex: 16 } }));
    expect(result.total).toEqual({ min: 4, max: 8 });
  });
  it("entraîneurs : même règle de lot", async () => {
    const batched = await preflightJobs(seed(), input({ key: "football.coaches", clubBatchSize: 3, requestLimit: 12 }));
    expect(batched.total).toEqual({ min: 0, max: 3 });
    const full = await preflightJobs(seed(), input({ key: "football.coaches", requestLimit: 12 }));
    expect(full.total).toEqual({ min: 0, max: 18 });
  });
  it("lot invalide (0, négatif, texte) : ignoré", async () => {
    for (const clubBatchSize of [0, -2, "abc"]) expect((await preflightJobs(seed(), input({ clubBatchSize, requestLimit: 100 }))).total.max).toBe(72);
  });
});

describe("cron competition-refresh — passage statistiques", () => {
  it("le lot envoyé par le cron passe le vrai préflight", async () => {
    state.db = seed();
    await tick();
    const stats = state.runs.find((run) => run.key === "football.squads");
    expect(stats.ctx).toMatchObject({ competitionId: "c-144", season: "2026-2027", clubBatchSize: 3, requestLimit: 12 });
    const result = await preflightJobs(state.db, { key: "football.squads", ...stats.ctx, db: undefined });
    expect(result.blockers).toEqual([]);
  });
  it("réglage incohérent (lot de 10, budget 12) : budget relevé au coût du lot", async () => {
    state.db = seed({ stats_club_batch: 10, stats_per_call: 12 });
    await tick();
    const stats = state.runs.find((run) => run.key === "football.squads");
    expect(stats.ctx).toMatchObject({ clubBatchSize: 10, requestLimit: 40 });
    expect((await preflightJobs(state.db, { key: "football.squads", ...stats.ctx, db: undefined })).blockers).toEqual([]);
  });
});
