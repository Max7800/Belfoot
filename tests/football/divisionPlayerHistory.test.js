import { beforeEach, describe, expect, it } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { syncDivisionPlayerHistory } from "@/modules/football/divisionPlayerHistory";
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
const seed = () => createFakeSupabase({
  seasons: [{ id: "s", competition_id: "league", label: "2026-2027" }],
  matches: [{ id: "m", season_id: "s", competition_id: "league", home_club_id: "a" }],
  player_team_seasons: [{ id: "member", player_id: "p", club_id: "a", season_start_year: 2026, squad_role: "first_team" }],
  players: [{ id: "p", name: "Player", source: "apifootball", external_id: "10", career_synced_at: null, ext: { career_stats_seasons: { 2022: "2026-01-01", 2024: "error" } } }],
  clubs: [], competitions: [], player_season_stats: [],
});
const run = (db, limit) => syncDivisionPlayerHistory(db, competition, { season: "2026-2027", now, requestLimit: limit, requestTracker: { count: 0 } });

describe("historique de division par lots", () => {
  it("reprend après le budget, réutilise les saisons existantes et retente les erreurs", async () => {
    const db = seed();
    const first = await run(db, 3);
    expect(first.complete).toBe(false);
    expect(calls).toEqual(["career:p", "p:2021", "p:2023"]);
    calls = [];
    const second = await run(db, 3);
    expect(second.complete).toBe(true);
    expect(calls).toEqual(["p:2024", "p:2025"]);
    expect(db.rows("players")[0].ext.career_stats_seasons[2024]).not.toBe("error");
    calls = [];
    await run(db, 3);
    expect(calls).toEqual([]);
  });

  it("n'acquitte pas une saison dont la récupération échoue", async () => {
    const db = seed();
    registerProvider({
      key: "apifootball",
      async fetchPlayerCareer(_player, ctx) { ctx.requestTracker.count++; return []; },
      async fetchPlayerCareerSeason(_player, ctx) { ctx.requestTracker.count++; throw new Error("API indisponible"); },
    });
    await expect(run(db, 3)).rejects.toThrow("API indisponible");
    expect(db.rows("players")[0].ext.career_stats_seasons[2021]).toBeUndefined();
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
    await expect(run(db, 3)).rejects.toThrow(/sans identifiant/);
    expect(calls).toEqual([]);
  });
});
