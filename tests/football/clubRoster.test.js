import { describe, expect, it, vi } from "vitest";
import { loadClubRosterData, selectClubRoster } from "@/lib/clubRoster";
import { createFakeSupabase } from "../helpers/fakeSupabase";

describe("effectif d'un club par saison", () => {
  const players = [{ id: "current" }, { id: "left" }, { id: "archive" }];
  const memberships = [
    { player_id: "current", season_start_year: 2026, active: true },
    { player_id: "left", season_start_year: 2026, active: false },
    { player_id: "archive", season_start_year: 2024, active: false },
  ];
  it("ne remplace pas une saison demandée et absente par l'effectif récent", () => {
    const result = selectClubRoster({ memberships, players, requestedYear: 2023, contextYear: 2026, currentYear: 2026 });
    expect(result.rosterYear).toBe(2023);
    expect(result.squad).toEqual([]);
  });
  it("distingue départs courants et joueurs d'une saison archivée", () => {
    expect(selectClubRoster({ memberships, players, contextYear: 2026, currentYear: 2026 }).squad.map((p) => p.id)).toEqual(["current"]);
    expect(selectClubRoster({ memberships, players, requestedYear: 2024, currentYear: 2026 }).squad.map((p) => p.id)).toEqual(["archive"]);
  });
  it("ne présente pas l'effectif actuel comme une archive sans affectations", () => {
    expect(selectClubRoster({ memberships: [], players, requestedYear: 2024, currentYear: 2026 }).squad).toEqual([]);
    expect(selectClubRoster({ memberships: [], players, requestedYear: 2026, currentYear: 2026 }).squad).toEqual(players);
  });
});

describe("lectures de l'effectif d'un club", () => {
  const seed = () => createFakeSupabase({
    player_team_seasons: [{ id: "m1", club_id: "club", player_id: "ancien", season_start_year: 2025 }, { id: "m2", club_id: "club", player_id: "actuel", season_start_year: 2026 }],
    players: [{ id: "ancien", name: "Ancien", club_id: "autre" }, { id: "actuel", name: "Actuel", club_id: "club" }, { id: "hors", name: "Hors effectif", club_id: "club" }],
  });
  it("charge les joueurs des affectations sans lire deux fois la table", async () => {
    const fake = seed();
    const db = { ...fake, from: vi.fn((table) => fake.from(table)) };
    const result = await loadClubRosterData(db, "club");
    expect(result.players.map((player) => player.id)).toEqual(["actuel", "ancien"]);
    expect(result.memberships).toHaveLength(2);
    expect(db.from.mock.calls.filter(([table]) => table === "players")).toHaveLength(1);
  });
  it("conserve le repli sur les joueurs actuels sans affectation", async () => {
    const fake = seed();
    fake.rows("player_team_seasons").splice(0);
    const result = await loadClubRosterData(fake, "club");
    expect(result.memberships).toEqual([]);
    expect(result.players.map((player) => player.id)).toEqual(["actuel", "hors"]);
  });
  it("lit toutes les affectations et fiches au-delà de la limite Supabase", async () => {
    const players = Array.from({ length: 1205 }, (_, i) => ({ id: `p${String(i).padStart(4, "0")}`, name: `Joueur ${String(i).padStart(4, "0")}`, club_id: "club" }));
    const player_team_seasons = players.map((player) => ({ id: `m${player.id}`, club_id: "club", player_id: player.id, season_start_year: 2026 }));
    const result = await loadClubRosterData(createFakeSupabase({ players, player_team_seasons }), "club");
    expect(result.memberships).toHaveLength(1205);
    expect(result.players).toHaveLength(1205);
  });
  it("conserve les affectations et utilise le repli si leur lecture de joueurs échoue", async () => {
    const fake = seed();
    const db = { ...fake, from(table) {
      const query = fake.from(table);
      if (table === "players") query.in = () => { query.then = (resolve) => resolve({ data: null, error: { message: "erreur de test" } }); return query; };
      return query;
    } };
    const result = await loadClubRosterData(db, "club");
    expect(result.memberships).toHaveLength(2);
    expect(result.players.map((player) => player.id)).toEqual(["actuel", "hors"]);
  });
  it("utilise les joueurs courants si la lecture des affectations échoue", async () => {
    const fake = seed();
    const db = { ...fake, from(table) {
      const query = fake.from(table);
      if (table === "player_team_seasons") query.then = (resolve) => resolve({ data: null, error: { message: "erreur de test" } });
      return query;
    } };
    const result = await loadClubRosterData(db, "club");
    expect(result.memberships).toEqual([]);
    expect(result.players.map((player) => player.id)).toEqual(["actuel", "hors"]);
  });
});
