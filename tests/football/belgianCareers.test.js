import { afterEach, describe, expect, it, vi } from "vitest";
import playerCareersJob from "@/modules/football/jobs/playerCareers";
import { JOB_PIPELINES } from "@/lib/jobCatalog";
import { preflightJobs, requiredMigrationsForJob } from "@/lib/jobPreflight";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// 28/10/2026 : 44 des 236 Belges trouvés par le balayage avaient un parcours
// (≥ 3 saisons), 89 aucun. Le job « Historiques de carrière » ne visait que
// les clubs d'une compétition importée.
const careers = {
  "101": [{ team: { id: 1, name: "KRC Genk", logo: null, national: false }, seasons: [2021, 2022] }, { team: { id: 2, name: "Yokohama F. Marinos", logo: null, national: false }, seasons: [2024, 2025] }, { team: { id: 3, name: "Belgium U21", logo: null, national: true }, seasons: [2022] }],
  "102": [{ team: { id: 4, name: "Standard Liège", logo: null, national: false }, seasons: [2023] }],
};
const calls = [];
function stubApi() {
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const id = /player=(\d+)/.exec(String(url))?.[1];
    calls.push(id);
    return { status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify({ response: careers[id] || [], errors: [], paging: { total: 1 } }) };
  }));
}
const player = (id, external, extra = {}) => ({ id, source: "apifootball", external_id: external, name: `Joueur ${external}`, nationality: "Belgium", tracked: true, active: true, career_synced_at: null, ext: {}, ...extra });
const seed = (players) => createFakeSupabase({ players, clubs: [], player_team_seasons: [], schema_migrations: requiredMigrationsForJob("football.player-careers", "2026-2027") });
const run = (db, ctx = {}) => playerCareersJob.run({ db, globalScope: true, apifootballKey: "test", batchSize: 5, ...ctx });
afterEach(() => { vi.unstubAllGlobals(); calls.length = 0; });

describe("Parcours des Belges à l'étranger (pipeline global)", () => {
  it("seuls les Belges trouvés par le balayage : clubs passés saison par saison, sélection écartée, un appel par joueur", async () => {
    stubApi();
    const db = seed([player("p-1", "101", { ext: { league_stats: { league_id: 98 } } }), player("p-2", "102", { ext: { league_stats: { league_id: 39 } } }), player("p-3", "103")]);
    const result = await run(db);
    expect(calls.sort()).toEqual(["101", "102"]);
    const rows = db.rows("player_team_seasons").filter((row) => row.player_id === "p-1").map((row) => row.season_start_year).sort();
    expect(rows).toEqual([2021, 2022, 2024, 2025]); // Belgium U21 : jamais une affectation de club
    expect(db.rows("player_team_seasons").some((row) => row.player_id === "p-2")).toBe(true);
    expect(db.rows("players").find((row) => row.id === "p-3").career_synced_at).toBeNull();
    expect(result).toMatchObject({ complete: true, progress: { current: 2, total: 2, unit: "joueurs" } });
    expect(result.detail).toContain("parcours à jour");
  });
  it("reprise : un joueur déjà rafraîchi dans cette passe n'est pas repayé ; lot borné", async () => {
    stubApi();
    const refreshBefore = "2026-10-28T20:00:00.000Z";
    const db = seed([player("p-1", "101", { ext: { league_stats: {} }, career_synced_at: "2026-10-28T21:00:00.000Z" }), player("p-2", "102", { ext: { league_stats: {} }, career_synced_at: "2026-10-01T00:00:00.000Z" })]);
    const result = await run(db, { resumeState: { refreshBefore }, batchSize: 5 });
    expect(calls).toEqual(["102"]);
    expect(result.complete).toBe(true);
  });
  it("lot incomplet : avancement signalé pour que le pipeline continue", async () => {
    stubApi();
    const db = seed([player("p-1", "101", { ext: { league_stats: {} } }), player("p-2", "102", { ext: { league_stats: {} } })]);
    const result = await run(db, { batchSize: 1 });
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ complete: false, progress: { current: 1, total: 2 } });
  });
  it("sans pipeline global ni compétition : refus, comme avant", async () => {
    await expect(playerCareersJob.run({ db: seed([]) })).rejects.toThrow();
  });
  it("pipeline déclaré global et repris ; préflight : un appel par joueur du lot", async () => {
    expect(JOB_PIPELINES.find((item) => item.key === "belgian-careers")).toMatchObject({ jobs: ["football.player-careers"], drainJobs: ["football.player-careers"], globalScope: true });
    const db = seed([player("p-1", "101", { ext: { league_stats: {} } }), player("p-2", "102", { ext: { league_stats: {} } }), player("p-3", "103")]);
    const result = await preflightJobs(db, { pipelineKey: "belgian-careers", requestLimit: 300, batchSize: 5 });
    expect(result.blockers).toEqual([]);
    expect(result.total.max).toBe(2);
    const capped = await preflightJobs(db, { pipelineKey: "belgian-careers", requestLimit: 300, batchSize: 1 });
    expect(capped.total.max).toBe(1);
  });
});
