import { beforeEach, describe, expect, it } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { followBelgiansAbroad } from "@/modules/football/belgiansAbroadFollow";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Nouveaux Belges du balayage complétés tout seuls par le suivi (30/10/2026) :
// parcours en club, puis saisons passées, avec les appels restants du passage.
const NOW = new Date("2026-10-30T12:00:00Z");
let calls = [];
beforeEach(() => {
  calls = [];
  registerProvider({
    key: "apifootball",
    async fetchMatches() { calls.push("fixtures"); return []; },
    async fetchPlayerCareer(player) { calls.push(`career:${player.external_id}`); return [{ team: { external_id: "194", name: "Ajax", logo_url: null, national: false }, season: "2024-2025", ext: {} }, { team: { external_id: "194", name: "Ajax", logo_url: null, national: false }, season: "2025-2026", ext: {} }]; },
    async fetchPlayerCareerSeason(player, ctx) { calls.push(`season:${player.external_id}:${String(ctx.season).slice(0, 4)}`); return []; },
    async fetchLeaguePlayersPage() { calls.push("scan"); return { players: [], pages: 1 }; },
  });
});
const seed = (players) => createFakeSupabase({
  clubs: [{ id: "k-ajax", source: "apifootball", external_id: "194", name: "Ajax", team_type: "first_team", locked: false, ext: {} }],
  players,
  player_team_seasons: [],
  site_settings: [{ id: 1, data: { football_abroad_follow_state: { leagues: { 88: { fixturesAt: NOW.toISOString() } }, scan: { leagueIndex: 0, page: 1, cycleStartedAt: NOW.toISOString(), cycleCompletedAt: NOW.toISOString() } } } }],
}, { notNull: { clubs: ["name"] } });
const belgian = (id, external, extra = {}) => ({ id, source: "apifootball", external_id: external, name: `Belge ${external}`, nationality: "Belgium", club_id: "k-ajax", tracked: true, active: true, locked: false, career_synced_at: null, ext: { league_stats: { league_id: 88, season: "2026-2027" } }, ...extra });
const pass = (db, used = 0) => followBelgiansAbroad(db, { now: NOW, requestLimit: 12, requestTracker: { count: used } });

describe("suivi des Belges : nouveaux Belges complétés", () => {
  it("1er passage : parcours du nouveau Belge ; 2e passage : ses saisons passées (celles de son parcours)", async () => {
    const db = seed([belgian("p-1", "501")]);
    const first = await pass(db);
    expect(calls).toEqual(["career:501"]);
    expect(first.detail).toContain("parcours d'un nouveau Belge");
    calls = [];
    const second = await pass(db);
    expect(calls).toEqual(["season:501:2024", "season:501:2025"]);
    expect(second.detail).toContain("saisons passées : 1 Belge(s) complété(s)");
    calls = [];
    expect((await pass(db)).detail).not.toMatch(/parcours|saisons passées/); // tout est fait : plus aucun appel
    expect(calls).toEqual([]);
  });
  it("un seul nouveau Belge par passage", async () => {
    const db = seed([belgian("p-1", "501"), belgian("p-4", "504")]);
    await pass(db);
    expect(calls.filter((call) => call.startsWith("career:"))).toHaveLength(1);
  });
  it("Belge déjà traité jamais refait (pas de rafraîchissement sans fin)", async () => {
    const db = seed([belgian("p-2", "502", { career_synced_at: "2026-10-28T00:00:00Z", ext: { league_stats: { league_id: 88 }, past_stats_done_at: "2026-10-29T00:00:00Z" } })]);
    await pass(db);
    expect(calls).toEqual([]);
  });
  it("moins de 2 appels restants dans le passage : rien (programme et feuilles passent d'abord)", async () => {
    const db = seed([belgian("p-1", "501")]);
    await pass(db, 11);
    expect(calls).toEqual([]);
  });
  it("saisons passées bornées par les appels restants du passage", async () => {
    const db = seed([belgian("p-3", "503", { career_synced_at: "2026-10-28T00:00:00Z" })]);
    db.rows("player_team_seasons").push({ player_id: "p-3", season_start_year: 2023 }, { player_id: "p-3", season_start_year: 2024 }, { player_id: "p-3", season_start_year: 2025 });
    await pass(db, 9);
    expect(calls).toEqual(["season:503:2023", "season:503:2024", "season:503:2025"]);
    calls = [];
    const db2 = seed([belgian("p-3", "503", { career_synced_at: "2026-10-28T00:00:00Z" })]);
    db2.rows("player_team_seasons").push({ player_id: "p-3", season_start_year: 2023 }, { player_id: "p-3", season_start_year: 2024 }, { player_id: "p-3", season_start_year: 2025 });
    await pass(db2, 10);
    expect(calls).toEqual(["season:503:2023", "season:503:2024"]);
  });
});
