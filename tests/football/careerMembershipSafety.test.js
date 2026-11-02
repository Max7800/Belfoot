import { describe, expect, it } from "vitest";
import { upsertPlayerMembership } from "@/modules/football/playerMemberships";
import { createFakeSupabase } from "../helpers/fakeSupabase";

describe("affectations issues des historiques", () => {
  it("préserve les données de l'effectif lorsqu'une affectation existe déjà", async () => {
    const existing = { id: "m1", player_id: "p1", club_id: "c1", season: "2026-2027", active: true, position: "Forward", locked: false, ext: { roster: true } };
    const db = createFakeSupabase({ player_team_seasons: [existing] });
    await upsertPlayerMembership(db, { playerId: "p1", club: { id: "c1" }, season: "2026-2027", active: false, preserveExisting: true });
    expect(db.rows("player_team_seasons")[0]).toEqual(existing);
  });

  it("crée une affectation historique absente", async () => {
    const db = createFakeSupabase({ player_team_seasons: [] });
    await upsertPlayerMembership(db, { playerId: "p1", club: { id: "c1" }, season: "2024-2025", active: false, preserveExisting: true });
    expect(db.rows("player_team_seasons")).toHaveLength(1);
    expect(db.rows("player_team_seasons")[0]).toMatchObject({ player_id: "p1", club_id: "c1", active: false });
  });

  it("ne crée pas de doublon entre 2026 et 2026-2027", async () => {
    const db = createFakeSupabase({ player_team_seasons: [{ id: "m", player_id: "p1", club_id: "c1", season: "2026", active: true, locked: false }] });
    await upsertPlayerMembership(db, { playerId: "p1", club: { id: "c1" }, season: "2026-2027", active: false, preserveExisting: true });
    expect(db.rows("player_team_seasons")).toHaveLength(1);
    expect(db.rows("player_team_seasons")[0]).toMatchObject({ season: "2026", active: true });
    await upsertPlayerMembership(db, { playerId: "p2", club: { id: "c1" }, season: "2026" });
    await upsertPlayerMembership(db, { playerId: "p2", club: { id: "c1" }, season: "2026-2027" });
    expect(db.rows("player_team_seasons").filter((row) => row.player_id === "p2")).toHaveLength(1);
    expect(db.rows("player_team_seasons").find((row) => row.player_id === "p2").season).toBe("2026-2027");
  });
});
