import { beforeEach, describe, expect, it } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { syncDivisionPlayerHistory } from "@/modules/football/divisionPlayerHistory";
import { syncBelgianSeasonStats } from "@/modules/football/belgianSeasonStats";
import divisionHistoryJob from "@/modules/football/jobs/divisionPlayerHistory";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const now = new Date("2026-11-01T00:00:00Z");
const competition = { id: "league", name: "Pro League", provider: "apifootball" };
let calls;
beforeEach(() => {
  calls = [];
  registerProvider({
    key: "apifootball",
    async fetchPlayerCareer(player, ctx) { calls.push(`career:${player.id}`); ctx.requestTracker.count++; return []; },
    async fetchPlayerCareerSeason(player, ctx) { calls.push(`${player.id}:${ctx.season}`); ctx.requestTracker.count++; return []; },
  });
});
const seed = () => {
  let db;
  db = createFakeSupabase({
  seasons: [{ id: "s", competition_id: "league", label: "2026-2027" }],
  matches: [{ id: "m", season_id: "s", competition_id: "league", home_club_id: "a" }],
  player_team_seasons: [{ id: "member", player_id: "p", club_id: "a", season_start_year: 2026, squad_role: "first_team" }],
  players: [{ id: "p", name: "Player", source: "apifootball", external_id: "10", career_synced_at: null, ext: { career_stats_seasons: { 2022: "2026-01-01", 2024: "error" } } }],
  player_history_work: [{ player_id: "p", season: 2022, state: "done" }, { player_id: "p", season: 2024, state: "error" }],
  clubs: [], competitions: [], player_season_stats: [],
  }, { rpc: {
    claim_player_history_work({ p_player, p_season, p_token }) {
      const rows = db.rows("player_history_work");
      let row = rows.find((item) => item.player_id === p_player && item.season === p_season);
      if (row?.state === "done" || row?.state === "running") return { data: false, error: null };
      if (!row) { row = { player_id: p_player, season: p_season }; rows.push(row); }
      Object.assign(row, { state: "running", lease_token: p_token });
      return { data: true, error: null };
    },
    finish_player_history_work({ p_player, p_season, p_token, p_error }) {
      const row = db.rows("player_history_work").find((item) => item.player_id === p_player && item.season === p_season && item.lease_token === p_token);
      if (!row) return { data: false, error: null };
      row.state = p_error ? "error" : "done";
      return { data: true, error: null };
    },
    patch_player_history_metadata({ p_player, p_patch }) {
      const item = db.rows("players").find((row) => row.id === p_player);
      item.ext = { ...item.ext, career_stats_seasons: { ...(item.ext?.career_stats_seasons || {}), ...p_patch.career_stats_seasons } };
      return { data: true, error: null };
    },
  } });
  return db;
};
const run = (db, limit) => syncDivisionPlayerHistory(db, competition, { season: "2026-2027", now, requestLimit: limit, requestTracker: { count: 0 } });

describe("historique de division par lots", () => {
  it("refuse les compétitions autres que la Pro League et l'absence de cible", async () => {
    const db = seed();
    db.rows("competitions").push({ id: "other", provider: "apifootball", external_id: "2" });
    await expect(divisionHistoryJob.run({ db })).rejects.toThrow();
    await expect(divisionHistoryJob.run({ db, competitionId: "other" })).rejects.toThrow(/réservé/);
    expect(calls).toEqual([]);
  });
  it("reprend après le budget, réutilise les saisons existantes et retente les erreurs", async () => {
    const db = seed();
    const first = await run(db, 3);
    expect(first.complete).toBe(false);
    expect(calls).toEqual(["career:p", "p:2021", "p:2023"]);
    calls = [];
    const second = await run(db, 3);
    expect(second.complete).toBe(true);
    expect(calls).toEqual(["p:2024", "p:2025"]);
    expect(db.rows("player_history_work").find((row) => row.season === 2024).state).toBe("done");
    calls = [];
    db.rpcCalls.length = 0;
    await run(db, 3);
    expect(calls).toEqual([]);
    expect(db.rpcCalls).toEqual([]); // aucune nouvelle prise de bail pour les étapes terminées
  });

  it("n'acquitte pas une saison dont la récupération échoue", async () => {
    const db = seed();
    registerProvider({
      key: "apifootball",
      async fetchPlayerCareer(_player, ctx) { ctx.requestTracker.count++; return []; },
      async fetchPlayerCareerSeason(_player, ctx) { ctx.requestTracker.count++; throw new Error("API indisponible"); },
    });
    await expect(run(db, 3)).rejects.toThrow("API indisponible");
    expect(db.rows("player_history_work").find((row) => row.season === 2021).state).toBe("error");
  });

  it("ne déclare pas une division complète si aucun effectif n'est connu", async () => {
    const db = seed();
    db.rows("player_team_seasons").splice(0);
    await expect(run(db, 3)).rejects.toThrow(/Aucun joueur/);
    expect(calls).toEqual([]);
  });

  it("signale une fiche sans identifiant au lieu de l'ignorer", async () => {
    const db = seed();
    db.rows("players")[0].external_id = null;
    const result = await run(db, 3);
    expect(result.complete).toBe(false);
    expect(result.detail).toMatch(/sans identifiant/);
    expect(calls).toEqual([]);
  });

  it("ne relance pas une saison détenue par une autre exécution", async () => {
    const db = seed();
    db.rows("player_history_work").push({ player_id: "p", season: 0, state: "done" });
    db.rows("player_history_work").push({ player_id: "p", season: 2021, state: "running", lease_token: "other" });
    const result = await run(db, 3);
    expect(result.complete).toBe(false);
    expect(result.detail).toContain("en cours ailleurs");
    expect(calls).toEqual([]);
  });

  it("deux pipelines ne demandent pas simultanément la même saison", async () => {
    const db = seed();
    Object.assign(db.rows("players")[0], { tracked: true, active: true, ext: { league_stats: {}, career_stats_seasons: { 2022: "ok", 2023: "ok", 2024: "ok", 2025: "ok" } } });
    db.rows("player_history_work").splice(0, Infinity, ...[0, 2022, 2023, 2024, 2025].map((season) => ({ player_id: "p", season, state: "done" })));
    let enter; let release;
    const entered = new Promise((resolve) => { enter = resolve; });
    const blocked = new Promise((resolve) => { release = resolve; });
    registerProvider({ key: "apifootball", async fetchPlayerCareer() { throw new Error("appel imprévu"); }, async fetchPlayerCareerSeason(_player, ctx) { calls.push(ctx.season); ctx.requestTracker.count++; enter(); await blocked; return []; } });
    const first = run(db, 5);
    await entered;
    const second = await syncBelgianSeasonStats(db, { now, historyWork: true, expandHistory: true, requestLimit: 5, requestTracker: { count: 0 } });
    expect(second.complete).toBe(false);
    expect(calls).toEqual(["2021"]);
    release();
    expect((await first).complete).toBe(true);
  });
});
