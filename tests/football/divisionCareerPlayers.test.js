import { describe, expect, it } from "vitest";
import { loadDivisionCareerPlayers, pendingDivisionCareerPlayers } from "@/modules/football/divisionCareerPlayers";
import { createFakeSupabase } from "../helpers/fakeSupabase";

describe("joueurs d'une division et d'une saison", () => {
  it("inclut joueurs non suivis et transférés, sans doublon ni autre saison", async () => {
    const db = createFakeSupabase({
      seasons: [{ id: "s", competition_id: "league", label: "2026-2027" }],
      matches: [{ id: "m", competition_id: "league", season_id: "s", home_club_id: "a", away_club_id: "b" }],
      clubs: [],
      player_team_seasons: [
        { id: "1", player_id: "p", club_id: "a", season_start_year: 2026, squad_role: "first_team", active: false },
        { id: "2", player_id: "p", club_id: "b", season_start_year: 2026, squad_role: "first_team", active: true },
        { id: "3", player_id: "old", club_id: "a", season_start_year: 2025, squad_role: "first_team" },
      ],
      players: [
        { id: "p", name: "Joueur", source: "apifootball", external_id: "1", tracked: false, active: false, club_id: "foreign" },
        { id: "old", name: "Ancien", source: "apifootball", external_id: "2" },
      ],
    });
    const result = await loadDivisionCareerPlayers(db, { id: "league", name: "Pro League", provider: "apifootball" }, "2026-2027");
    expect(result.players.map((p) => p.id)).toEqual(["p"]);
    expect(result.membershipCount).toBe(1);
  });

  it("reprend uniquement les joueurs non traités depuis le début de la passe", () => {
    const players = [{ id: "a", career_synced_at: "2026-10-02" }, { id: "b", career_synced_at: null }, { id: "c", career_synced_at: "2026-10-04" }];
    expect(pendingDivisionCareerPlayers(players, "2026-10-03").map((p) => p.id)).toEqual(["b", "a"]);
  });
});
