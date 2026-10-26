import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mapFixture } from "@/modules/football/apifootball";
import { registerProvider } from "@/modules/football/providers";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { rawFixture } from "../helpers/apiFootballFixtures";
import { runJob } from "@/lib/jobs";
import { frenchTeamName } from "@/lib/frenchNations";

// La vraie route du cron national-refresh, branchée sur un faux Supabase :
// aucun réseau, aucun service réel (getAdmin est remplacé).
const state = vi.hoisted(() => ({ db: null }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => state.db }));
const { GET } = await import("@/app/api/cron/national-refresh/route");

const P = "apifootball";
const SECRET = "secret-de-test";
const T0 = new Date("2026-10-12T08:00:00Z").getTime();
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const MIGRATIONS = [["core", "0004_job_execution_guardrails"], ["football", "0028_followed_national_teams"], ["football", "0036_competition_scope"], ["football", "0038_player_national_team"], ["football", "0032_season_rollout"]].map(([module, version]) => ({ module, version }));
const TEAMS = { 8183: "Belgium U21", 1777: "Belgium W" };
// Après une synchro réussie, la sélection est stockée sous son nom français.
const isU21 = (item) => item.team === TEAMS[8183] || item.team === frenchTeamName(TEAMS[8183]);
const calls = { 8183: 0, 1777: 0 };

// Belgium U21 joue en ligue 850, dont le slug est occupé par la fiche 666 :
// collision persistante. Belgium W joue en 666 : aucune collision.
function fixturesFor(teamId) {
  if (teamId === "8183") return [rawFixture({ id: 1350300, date: "2026-11-14T18:00:00+00:00", season: 2025, leagueId: 850, leagueName: "UEFA U21 Championship - Qualification", round: "Group Stage - 26", home: { id: 8183, name: TEAMS[8183] }, away: { id: 8200, name: "Austria U21" } })];
  return [rawFixture({ id: 1400001, date: "2026-11-27T18:00:00+00:00", season: 2026, leagueId: 666, leagueName: "Friendlies Women", round: "Friendlies 3", home: { id: 1777, name: TEAMS[1777] }, away: { id: 1778, name: "Netherlands W" } })];
}

function seed() {
  return createFakeSupabase({
    competitions: [{ id: "c-3e49", name: "UEFA U21 Championship - Qualification", source: P, provider: P, external_id: "666", slug: "international-850", competition_scope: "international", competition_type: "cup", locked: false, live_enabled: false }],
    clubs: [
      { id: "t-u21", source: P, external_id: "8183", name: TEAMS[8183], team_type: "national", national_category: "u21", national_followed: true, synced_at: null, locked: false },
      { id: "t-w", source: P, external_id: "1777", name: TEAMS[1777], team_type: "national", national_category: "women", national_followed: true, synced_at: null, locked: false },
    ],
    schema_migrations: MIGRATIONS,
    site_settings: [{ id: 1, data: {} }],
  }, { uniqueIndexes: { competitions: [["source", "external_id"], ["slug"]] } });
}

async function tick(at, { dryRun = false } = {}) {
  vi.setSystemTime(at);
  const response = await GET(new Request(`http://localhost/api/cron/national-refresh${dryRun ? "?dryRun=1" : ""}`, { headers: { authorization: `Bearer ${SECRET}` } }));
  return response.json();
}

// Ligne job_runs telle que runJob l'écrit pour une collision du cron.
const collisionRun = (at) => ({ id: `run-${at}`, job_key: "football.national-team", target_key: "team:8183", status: "error", started_at: new Date(at).toISOString(), finished_at: new Date(at).toISOString(), detail: "Collision de compétitions…", params: { teamExternalId: "8183", error_code: "COMPETITION_COLLISION" } });

beforeAll(() => { process.env.CRON_SECRET = SECRET; vi.useFakeTimers({ toFake: ["Date"] }); });
afterAll(() => { delete process.env.CRON_SECRET; vi.useRealTimers(); });
beforeEach(() => {
  calls[8183] = 0; calls[1777] = 0;
  registerProvider({
    key: P,
    async fetchClubById(id) { return { external_id: String(id), name: TEAMS[id], logo_url: null, city: null }; },
    async fetchNationalTeamMatches(id) { calls[id]++; return fixturesFor(String(id)).map(mapFixture); },
    async fetchCurrentSquad() { return []; },
  });
});

describe("cron national-refresh — collision persistante", () => {
  it("la sélection en collision n'est pas relancée toutes les 15 min ; les autres sont traitées ; relance à l'intervalle normal", async () => {
    state.db = seed();

    // Passage 1 : les deux sélections sont dues. U21 échoue en collision, W réussit.
    const first = await tick(T0);
    expect(first.results.map((item) => [item.team, item.ok])).toEqual(expect.arrayContaining([[TEAMS[8183], false], [TEAMS[1777], true]]));
    expect(first.results.find(isU21).error).toContain("Collision de compétitions");
    const collisionRuns = () => state.db.rows("job_runs").filter((run) => run.target_key === "team:8183" && run.params?.error_code === "COMPETITION_COLLISION");
    expect(collisionRuns()).toHaveLength(1);
    expect(state.db.rows("matches").filter((match) => match.external_id === "1350300")).toHaveLength(0);

    // Huit heures de passages toutes les 15 min : la collision n'est jamais relancée.
    for (let at = T0 + 15 * MINUTE; at <= T0 + 8 * HOUR; at += 15 * MINUTE) {
      const result = await tick(at);
      expect(result.results.find(isU21)).toBeUndefined();
      expect(result.heldAfterCollision).toBe(1);
    }
    expect(calls[8183]).toBe(1);
    expect(collisionRuns()).toHaveLength(1);

    // Les autres sélections restent traitées normalement : W redevient due (synchro ancienne).
    state.db.rows("clubs").find((club) => club.id === "t-w").synced_at = new Date(T0 - 21 * HOUR).toISOString();
    const other = await tick(T0 + 8 * HOUR + 15 * MINUTE);
    expect(other.results.map((item) => [item.team, item.ok])).toEqual([[TEAMS[1777], true]]);
    expect(calls[1777]).toBe(2);
    expect(calls[8183]).toBe(1);

    // À l'intervalle normal (20 h hors rassemblement), la collision est retentée une fois.
    const later = await tick(T0 + 20 * HOUR + MINUTE);
    expect(later.results.find(isU21)).toMatchObject({ ok: false });
    expect(calls[8183]).toBe(2);
    expect(collisionRuns()).toHaveLength(2);
  });

  it("une erreur autre qu'une collision garde le comportement existant (relance au passage suivant)", async () => {
    state.db = seed();
    // La compétition en cause est corrigée : plus de collision, mais l'API échoue.
    state.db.rows("competitions")[0].slug = "international-666";
    registerProvider({
      key: P,
      async fetchClubById(id) { return { external_id: String(id), name: TEAMS[id], logo_url: null, city: null }; },
      async fetchNationalTeamMatches(id) { calls[id]++; if (String(id) === "8183") throw new Error("API indisponible"); return fixturesFor(String(id)).map(mapFixture); },
      async fetchCurrentSquad() { return []; },
    });
    await tick(T0);
    const next = await tick(T0 + 15 * MINUTE);
    expect(next.results.find(isU21)).toMatchObject({ ok: false, error: expect.stringContaining("API indisponible") });
    expect(next.heldAfterCollision).toBe(0);
    expect(calls[8183]).toBe(2);
  });
});

describe("cron national-refresh — seuil en rassemblement, synchro manuelle, simulation", () => {
  it("rassemblement : la sélection en collision n'est pas relancée avant 4 h, puis l'est au seuil", async () => {
    state.db = seed();
    // Match de Belgium U21 dans 24 h : la sélection est « en rassemblement » (fenêtre de 48 h).
    state.db.rows("matches").push({ id: "m-proche", source: P, external_id: "777", competition_id: "c-3e49", home_club_id: "t-u21", away_club_id: null, kickoff: new Date(T0 + 24 * HOUR).toISOString(), status: "scheduled", locked: false });

    const first = await tick(T0);
    expect(first.results.find(isU21)).toMatchObject({ ok: false, windowActive: true });
    expect(calls[8183]).toBe(1);

    // Passages toutes les 15 min jusqu'à 3 h 45 : retenue par la collision.
    for (let at = T0 + 15 * MINUTE; at < T0 + 4 * HOUR; at += 15 * MINUTE) {
      const result = await tick(at);
      expect(result.results.find(isU21)).toBeUndefined();
      expect(result.heldAfterCollision).toBe(1);
    }
    expect(calls[8183]).toBe(1);

    // À 4 h exactement après la collision : relancée (seuil de rassemblement, pas 20 h).
    const atThreshold = await tick(T0 + 4 * HOUR);
    expect(atThreshold.results.find(isU21)).toMatchObject({ ok: false, windowActive: true });
    expect(atThreshold.heldAfterCollision).toBe(0);
    expect(calls[8183]).toBe(2);
  });

  it("synchro manuelle réussie après une collision : l'ancienne collision ne bloque plus, le rythme suit synced_at", async () => {
    state.db = seed();
    await tick(T0);
    expect(calls[8183]).toBe(1);

    // Correction humaine de la compétition, puis synchro manuelle réussie à T0 + 1 h
    // (même job que le panneau d'administration : runJob met synced_at à jour).
    state.db.rows("competitions")[0].slug = "international-666";
    vi.setSystemTime(T0 + HOUR);
    await runJob("football.national-team", { db: state.db, teamExternalId: "8183", nationalCategory: "u21", season: "2026-2027", requestLimit: 5 });
    expect(calls[8183]).toBe(2);
    const syncedAt = new Date(state.db.rows("clubs").find((club) => club.id === "t-u21").synced_at).getTime();
    expect(syncedAt).toBe(T0 + HOUR);
    expect(state.db.rows("matches").find((match) => match.external_id === "1350300")).toBeTruthy();

    // La collision de T0 reste dans job_runs, mais n'est plus comptée comme retenue.
    const soon = await tick(T0 + HOUR + 15 * MINUTE);
    expect(soon.heldAfterCollision).toBe(0);
    expect(soon.results.find(isU21)).toBeUndefined();

    // Rythme normal : 20 h après la synchro manuelle (et non après la collision).
    const before = await tick(T0 + 21 * HOUR - MINUTE);
    expect(before.results.find(isU21)).toBeUndefined();
    expect(before.heldAfterCollision).toBe(0);
    const normal = await tick(T0 + 21 * HOUR);
    expect(normal.results.find(isU21)).toMatchObject({ ok: true });
    expect(calls[8183]).toBe(3);
  });

  it("dryRun : vraie route en simulation, aucune méthode d'écriture appelée, aucun appel API", async () => {
    state.db = seed();
    state.db.rows("job_runs").push(collisionRun(T0 - HOUR));
    state.db.rows("matches").push({ id: "m-proche", source: P, external_id: "777", competition_id: "c-3e49", home_club_id: "t-w", away_club_id: null, kickoff: new Date(T0 + 2 * HOUR).toISOString(), status: "scheduled", locked: false });
    const writes = [];
    const from = state.db.from.bind(state.db);
    state.db.from = (tableName) => {
      const builder = from(tableName);
      for (const method of ["insert", "upsert", "update", "delete"]) {
        const original = builder[method].bind(builder);
        builder[method] = (...args) => { writes.push(`${tableName}.${method}`); return original(...args); };
      }
      return builder;
    };
    const rpc = state.db.rpc.bind(state.db);
    state.db.rpc = (...args) => { writes.push(`rpc.${args[0]}`); return rpc(...args); };
    const snapshot = JSON.stringify(["competitions", "clubs", "matches", "job_runs", "site_settings"].map((name) => state.db.rows(name)));

    const result = await tick(T0, { dryRun: true });
    expect(result).toMatchObject({ ok: true, dryRun: true, followed: 2, due: 1, heldAfterCollision: 1 });
    expect(result.picked).toEqual([expect.objectContaining({ team: TEAMS[1777], windowActive: true })]);
    expect(writes).toEqual([]);
    expect(calls).toEqual({ 8183: 0, 1777: 0 });
    expect(JSON.stringify(["competitions", "clubs", "matches", "job_runs", "site_settings"].map((name) => state.db.rows(name)))).toBe(snapshot);
  });
});
