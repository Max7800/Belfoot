import { afterEach, describe, expect, it, vi } from "vitest";
import seasonStatsJob from "@/modules/football/jobs/belgianSeasonStats";
import { pastSeasons, seasonsToFetch, syncBelgianSeasonStats } from "@/modules/football/belgianSeasonStats";
import { JOB_PIPELINES } from "@/lib/jobCatalog";
import { preflightJobs, requiredMigrationsForJob } from "@/lib/jobPreflight";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// 28/10/2026 : « on voit où ils sont passés mais pas le nombre de matchs par
// saison avec les stats » — 5 saisons passées demandées par l'utilisateur.
const NOW = new Date("2026-10-28T22:00:00Z");
const calls = [];
let failure = null;
function stubApi({ duplicate = false } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const [, id, season] = /players\?id=(\d+)&season=(\d+)/.exec(String(url)) || [];
    calls.push(`${id}:${season}`);
    if (failure && failure.test(`${id}:${season}`)) return { status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify({ response: [], errors: failure.errors, paging: {} }) };
    const statistics = [{ team: { id: 400 + Number(season) % 10, name: `Club ${season}`, logo: null }, league: { id: 88, name: "Eredivisie", country: "Netherlands", type: "League", logo: null, flag: null }, games: { appearences: 30, lineups: 25, minutes: 2200, rating: "7.1", position: "Midfielder" }, goals: { total: 6, assists: 4 }, cards: { yellow: 3, red: 0 } }];
    if (duplicate) statistics.push({ ...statistics[0], games: { ...statistics[0].games, appearences: 2, minutes: 100 }, goals: { total: 1, assists: 0 } });
    return { status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify({ response: [{ player: { id: Number(id), name: "Belge", nationality: "Belgium" }, statistics }], errors: [], paging: { total: 1 } }) };
  }));
}
const player = (id, external, ext = {}) => ({ id, source: "apifootball", external_id: external, name: `Joueur ${external}`, nationality: "Belgium", tracked: true, active: true, ext: { league_stats: { league_id: 88 }, ...ext } });
const seed = (players, memberships = []) => createFakeSupabase({ players, player_team_seasons: memberships, clubs: [], competitions: [], seasons: [], player_season_stats: [], schema_migrations: requiredMigrationsForJob("football.belgian-season-stats", "2026-2027") });
const run = (db, ctx = {}) => seasonStatsJob.run({ db, globalScope: true, apifootballKey: "test", now: NOW, batchSize: 5, requestLimit: 50, ...ctx });
const ext = (db, id) => db.rows("players").find((row) => row.id === id).ext;
afterEach(() => { vi.unstubAllGlobals(); calls.length = 0; failure = null; });

describe("saisons passées : règles", () => {
  it("5 saisons avant la saison en cours : 2021 à 2025 en octobre 2026, 2020 à 2024 en mars 2026", () => {
    expect(pastSeasons(NOW)).toEqual(["2021", "2022", "2023", "2024", "2025"]);
    expect(pastSeasons(new Date("2026-03-01T00:00:00Z"))).toEqual(["2020", "2021", "2022", "2023", "2024"]);
  });
  it("seulement les saisons du parcours, pas encore faites ; parcours vide : les 5", () => {
    const seasons = pastSeasons(NOW);
    expect(seasonsToFetch({ ext: {} }, [2024, 2025, 2026], seasons)).toEqual(["2024", "2025"]);
    expect(seasonsToFetch({ ext: { career_stats_seasons: { 2024: "x" } } }, [2024, 2025], seasons)).toEqual(["2025"]);
    expect(seasonsToFetch({ ext: {} }, [], seasons)).toEqual(seasons);
  });
});

describe("job « saisons passées des Belges »", () => {
  it("conserve le plan entre deux lots quand le mode étendu est désactivé", async () => {
    stubApi();
    const db = seed([player("p-1", "101")]);
    const ctx = { now: NOW, historyWork: true, expandHistory: false, apifootballKey: "test" };
    expect((await syncBelgianSeasonStats(db, { ...ctx, requestLimit: 1 })).complete).toBe(false);
    expect(ext(db, "p-1").past_stats_plan).toEqual(["2021", "2022", "2023", "2024", "2025"]);
    calls.length = 0;
    expect((await syncBelgianSeasonStats(db, { ...ctx, requestLimit: 5 })).complete).toBe(true);
    expect(calls).toEqual(["101:2022", "101:2023", "101:2024", "101:2025"]);
  });
  it("ne duplique pas les statistiques si l'API renvoie deux lignes pour le même club et championnat", async () => {
    stubApi({ duplicate: true });
    const db = seed([player("p-1", "101")]);
    await run(db);
    expect(db.rows("player_season_stats")).toHaveLength(5);
    expect(db.rows("player_season_stats").every((row) => row.appearances === 30 && row.goals === 6)).toBe(true);
  });
  it("avec l'état partagé, réutilise une saison finie et attend un bail en cours", async () => {
    stubApi();
    const db = seed([player("p-1", "101", { career_stats_seasons: { 2021: "ok", 2022: "ok", 2023: "ok" } })], [{ player_id: "p-1", season_start_year: 2024 }, { player_id: "p-1", season_start_year: 2025 }]);
    db.rows("player_history_work").push({ player_id: "p-1", season: 2024, state: "done" }, { player_id: "p-1", season: 2025, state: "running" });
    const originalRpc = db.rpc;
    db.rpc = async (name, args) => name === "claim_player_history_work" ? { data: false, error: null } : originalRpc(name, args);
    const result = await run(db, { historyWork: true });
    expect(calls).toEqual([]);
    expect(result.complete).toBe(false);
    expect(ext(db, "p-1").career_stats_seasons[2024]).toBeTruthy();
    expect(ext(db, "p-1").past_stats_done_at).toBeUndefined();
  });
  it("reprend une erreur ancienne même si l'ancien traitement avait marqué le joueur terminé", async () => {
    stubApi();
    const db = seed([player("p-1", "101", { past_stats_done_at: "2026-01-01", career_stats_seasons: { 2021: "ok", 2022: "ok", 2023: "ok", 2024: "ok", 2025: "error" } })]);
    const result = await run(db);
    expect(calls).toEqual(["101:2025"]);
    expect(result.complete).toBe(true);
    expect(ext(db, "p-1").career_stats_seasons[2025]).not.toBe("error");
  });
  it("ajoute la saison qui vient de se terminer après un changement d'année sportive", async () => {
    stubApi();
    const db = seed([player("p-1", "101", { past_stats_done_at: "2026-10-01", career_stats_seasons: { 2021: "ok", 2022: "ok", 2023: "ok", 2024: "ok", 2025: "ok" } })]);
    const result = await run(db, { now: new Date("2027-10-01T00:00:00Z") });
    expect(calls).toEqual(["101:2026"]);
    expect(result.complete).toBe(true);
  });
  it("cinq saisons par joueur, lignes de stats écrites et joueurs marqués terminés", async () => {
    stubApi();
    const db = seed([player("p-1", "101"), player("p-2", "102"), { ...player("p-3", "103"), ext: {} }, player("p-4", "104", { past_stats_done_at: "2026-10-27T00:00:00Z", career_stats_seasons: { 2021: "ok", 2022: "ok", 2023: "ok", 2024: "ok", 2025: "ok" } })],
      [{ player_id: "p-1", season_start_year: 2024 }, { player_id: "p-1", season_start_year: 2025 }, { player_id: "p-1", season_start_year: 2026 }]);
    const result = await run(db);
    expect(calls).toEqual(["101:2021", "101:2022", "101:2023", "101:2024", "101:2025", "102:2021", "102:2022", "102:2023", "102:2024", "102:2025"]); // p-3 hors balayage, p-4 déjà fait
    const rows = db.rows("player_season_stats").filter((row) => row.player_id === "p-1");
    expect(rows.map((row) => [row.season, row.appearances, row.goals, row.assists, row.minutes]).sort()).toEqual(["2021", "2022", "2023", "2024", "2025"].map((year) => [year, 30, 6, 4, 2200]));
    expect(ext(db, "p-1")).toMatchObject({ career_stats_seasons: { 2024: expect.any(String), 2025: expect.any(String) }, past_stats_done_at: expect.any(String), league_stats: { league_id: 88 } });
    expect(result).toMatchObject({ complete: true, progress: { current: 2, total: 2 } });
  });
  it("budget atteint au milieu d'un joueur : saisons faites gardées, joueur non terminé, reprise sans rien repayer", async () => {
    stubApi();
    const db = seed([player("p-2", "102")]);
    const first = await run(db, { requestLimit: 3 });
    expect(calls).toEqual(["102:2021", "102:2022", "102:2023"]);
    expect(first.complete).toBe(false);
    expect(ext(db, "p-2").past_stats_done_at).toBeUndefined();
    calls.length = 0;
    const second = await run(db);
    expect(calls).toEqual(["102:2024", "102:2025"]);
    expect(second.complete).toBe(true);
  });
  it("échéance de temps atteinte : arrêt entre deux saisons, reprise ensuite (coupure Vercel à 60 s)", async () => {
    stubApi();
    const db = seed([player("p-2", "102")]);
    const first = await run(db, { deadline: Date.now() - 1 });
    expect(calls).toEqual([]);
    expect(first.complete).toBe(false);
    const second = await run(db);
    expect(calls).toHaveLength(5);
    expect(second.complete).toBe(true);
  });
  it("échéance par défaut : 35 s après le début du lot", async () => {
    const { SEASON_STATS_TIME_MS } = await import("@/modules/football/belgianSeasonStats");
    expect(SEASON_STATS_TIME_MS).toBe(35000);
    stubApi();
    const db = seed([player("p-2", "102")]);
    const realNow = Date.now;
    let clock = realNow();
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 9000)); // chaque lecture de l'horloge avance de 9 s
    try { await run(db, { deadline: undefined }); } finally { Date.now = realNow; vi.restoreAllMocks(); }
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThan(5);
  });
  it("refus de l'abonnement : arrêt sans rien marquer (reprise plus tard au même endroit)", async () => {
    stubApi();
    failure = Object.assign(/102:2022/, { errors: { plan: "Free plans do not have access to this season" } });
    const db = seed([player("p-2", "102")]);
    await expect(run(db)).rejects.toThrow(/plan/i);
    expect(ext(db, "p-2").career_stats_seasons).toEqual({ 2021: expect.any(String) });
    expect(ext(db, "p-2").past_stats_done_at).toBeUndefined();
  });
  it("erreur propre à une saison : enregistrée et reprise différée, sans déclarer le joueur terminé", async () => {
    stubApi();
    failure = Object.assign(/102:2023/, { errors: { parameters: "season inconnue" } });
    const db = seed([player("p-2", "102")]);
    await expect(run(db)).rejects.toThrow(/season inconnue/);
    expect(db.rows("player_history_work").find((row) => row.season === 2023).state).toBe("error");
    expect(ext(db, "p-2").past_stats_done_at).toBeUndefined();
  });
  it("sans pipeline global : refus", async () => {
    await expect(seasonStatsJob.run({ db: seed([]) })).rejects.toThrow(/pipeline/);
  });
  it("pipeline global repris ; préflight : lot × 5 saisons au plus", async () => {
    expect(JOB_PIPELINES.find((item) => item.key === "belgian-season-stats")).toMatchObject({ jobs: ["football.belgian-season-stats"], drainJobs: ["football.belgian-season-stats"], globalScope: true });
    const db = seed([player("p-1", "101"), player("p-2", "102"), player("p-4", "104", { past_stats_done_at: "x", career_stats_seasons: { 2021: "ok", 2022: "ok", 2023: "ok", 2024: "ok", 2025: "ok" } })]);
    const result = await preflightJobs(db, { pipelineKey: "belgian-season-stats", requestLimit: 1200, batchSize: 5 });
    expect(result.blockers).toEqual([]);
    expect(result.total.max).toBe(10);
    expect((await preflightJobs(db, { pipelineKey: "belgian-season-stats", requestLimit: 1200, batchSize: 1 })).total.max).toBe(5); // lot de 1 joueur
  });
});
