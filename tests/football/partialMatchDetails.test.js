import { describe, expect, it } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { syncEvents } from "@/modules/football/syncEvents";
import { syncLineups } from "@/modules/football/syncLineups";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const comp = { id: "c", name: "Test", provider: "partial", ext: {} };
const season = { id: "s", competition_id: "c", label: "2026-2027" };
const match = { id: "m", external_id: "1", competition_id: "c", season_id: "s", status: "finished", kickoff: "2026-10-01" };
const team = { id: "t", source: "partial", external_id: "10" };
const player = { id: "p", source: "partial", external_id: "11", name: "Joueur" };
const old = { id: "row", match_id: "m", competition_id: "c", source: "partial", player_external_id: "11", player_id: "p", club_id: "t", number: 7, position: "M", grid: null, starter: false, substitute: true, captain: false, minutes: 24, rating: 7, goals: 1, assists: 1, saves: 0, goals_conceded: null, yellow: 1, red: 0, locked: false };
const dbFor = (m = match) => createFakeSupabase({ seasons: [season], matches: [m], clubs: [team], players: [player], match_player_stats: [old], match_events: [{ id: "e", match_id: "m", source: "partial", type: "goal" }] });

describe("détails déjà enregistrés lors d'une réponse partielle", () => {
  it("une réponse vide conserve les événements existants", async () => {
    registerProvider({ key: "partial", async fetchEvents() { return []; } });
    const db = dbFor();
    await syncEvents(db, comp, { season: season.label });
    expect(db.rows("match_events")).toHaveLength(1);
    expect(db.rpcCalls.some((call) => call.name === "replace_provider_match_events")).toBe(false);
    expect(db.rows("matches")[0].events_synced_at).toBeTruthy();
  });
  it("des statistiques reçues seules conservent le statut de remplaçant", async () => {
    registerProvider({ key: "partial", async fetchMatchPlayerStats() { return [{ team_ext: "10", player_ext: "11", starter: true, substitute: false, minutes: 30, goals: 2 }]; } });
    const db = dbFor({ ...match, lineups_synced_at: "2026-10-01" });
    await syncLineups(db, comp, { season: season.label });
    expect(db.rows("match_player_stats")[0]).toMatchObject({ starter: false, substitute: true, number: 7, minutes: 30, goals: 2 });
  });
  it("une composition reçue seule conserve les performances existantes", async () => {
    registerProvider({ key: "partial", async fetchMatchLineups() { return [{ team_ext: "10", players: [{ team_ext: "10", player_ext: "11", starter: true, substitute: false, number: 8 }] }]; } });
    const db = dbFor({ ...match, player_stats_synced_at: "2026-10-01" });
    await syncLineups(db, comp, { season: season.label });
    expect(db.rows("match_player_stats")[0]).toMatchObject({ starter: true, number: 8, minutes: 24, rating: 7, goals: 1, assists: 1 });
  });
  it("une réponse collective vide ne remplace pas les lignes existantes", async () => {
    registerProvider({ key: "partial", async fetchMatchTeamStats() { return []; } });
    const db = dbFor();
    await syncLineups(db, comp, { season: season.label });
    expect(db.rpcCalls.some((call) => call.name === "replace_provider_match_team_stats")).toBe(false);
    expect(db.rows("matches")[0].team_stats_synced_at).toBeTruthy();
  });
});
