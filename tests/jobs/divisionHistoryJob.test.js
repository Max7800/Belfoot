import { beforeEach, describe, expect, it } from "vitest";
import { runJob } from "@/lib/jobs";
import { requiredMigrationsForJob } from "@/lib/jobPreflight";
import { registerProvider } from "@/modules/football/providers";
import { createFakeSupabase } from "../helpers/fakeSupabase";

let calls;
beforeEach(() => {
  calls = [];
  registerProvider({
    key: "apifootball",
    async fetchPlayerCareer(_player, ctx) { await ctx.requestTracker.beforeRequest(); calls.push("career"); return []; },
    async fetchPlayerCareerSeason(_player, ctx) { await ctx.requestTracker.beforeRequest(); calls.push(String(ctx.season)); return []; },
  });
});
const seed = () => createFakeSupabase({
  competitions: [{ id: "league", name: "Pro League", provider: "apifootball", external_id: "144", competition_type: "league", ext: {} }],
  seasons: [{ id: "s", competition_id: "league", label: "2026-2027" }],
  clubs: [{ id: "a", name: "Club A", source: "apifootball", external_id: "10", team_type: "first_team" }],
  matches: [{ id: "m", competition_id: "league", season_id: "s", home_club_id: "a", away_club_id: null }],
  players: [{ id: "p", name: "Player", source: "apifootball", external_id: "20", career_synced_at: null, ext: {} }],
  player_team_seasons: [{ id: "membership", player_id: "p", club_id: "a", season_start_year: 2026, season: "2026-2027", squad_role: "first_team" }],
  player_history_work: [2021, 2022, 2023, 2024].map((season) => ({ player_id: "p", season, state: "done" })),
  schema_migrations: requiredMigrationsForJob("football.division-history", "2026-2027"),
  site_settings: [{ id: 1, data: { football_import_plan: { version: 4, seasons: [{ label: "2026-2027", enabled: true }], competitions: { league: { enabled: true, expected_clubs: 1, seasons: { "2026-2027": { enabled: true, scope: "complete", expected_clubs: 1 } } } } } } }],
  player_season_stats: [],
});
const run = (db) => runJob("football.division-history", { db, competitionId: "league", season: "2026-2027", requestLimit: 1, now: new Date("2026-11-01T00:00:00Z") });

describe("job complet des historiques Pro League", () => {
  it("s'arrête au budget et reprend sans répéter le parcours", async () => {
    const db = seed();
    const first = await run(db);
    expect(first).toMatchObject({ complete: false, requests: 1 });
    expect(calls).toEqual(["career"]);
    const second = await run(db);
    expect(second).toMatchObject({ complete: true, requests: 1 });
    expect(calls).toEqual(["career", "2025"]);
    expect(db.rows("player_history_work").find((row) => row.player_id === "p" && row.season === 2025).state).toBe("done");
  });
});
