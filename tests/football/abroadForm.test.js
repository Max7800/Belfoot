import { describe, expect, it, vi } from "vitest";
import { buildAbroadForm } from "@/lib/abroadForm";

vi.mock("@/lib/belgiansAbroad", () => ({ UNKNOWN_COUNTRY: "Pays non précisé", UNKNOWN_COMPETITION: "Championnat non précisé" }));

describe("classement partagé des Belges en forme", () => {
  it("classe les cinq matchs récents de club, ignore la sélection et les performances anciennes", () => {
    const now = Date.now();
    const date = (days) => new Date(now - days * 86400000).toISOString();
    const data = {
      players: [
        { id: "a", name: "Alice", club_id: "fr", nationality: "Belgium", country: "France" },
        { id: "b", name: "Bob", club_id: "fr", nationality: "Belgium", country: "France" },
        { id: "c", name: "Charlie", club_id: "be", nationality: "Belgium", country: "Belgium" },
      ],
      clubs: { fr: { id: "fr", name: "Paris", ext: { country: "France" } }, be: { id: "be", name: "Bruges", ext: { country: "Belgium" } }, national: { id: "national", team_type: "national" } },
      competitions: {}, stats: {}, memberships: {},
      matches: [{ id: "recent", kickoff: date(1) }, { id: "old", kickoff: date(60) }, { id: "other", kickoff: date(2) }, { id: "national-game", kickoff: date(3) }],
      performances: [
        { player_id: "a", club_id: "fr", match_id: "recent", minutes: 90, goals: 2, rating: 8 },
        { player_id: "a", club_id: "fr", match_id: "old", minutes: 90, goals: 10, rating: 10 },
        { player_id: "a", club_id: "national", match_id: "national-game", minutes: 90, goals: 5 },
        { player_id: "b", club_id: "fr", match_id: "other", minutes: 90, goals: 1 },
        { player_id: "c", club_id: "be", match_id: "recent", minutes: 90, goals: 5 },
      ],
    };
    const result = buildAbroadForm(data);
    expect(result.form.map((item) => item.player.id)).toEqual(["a", "b"]);
    expect(result.form[0]).toMatchObject({ goals: 2, recentCount: 1, rating: 8 });
    expect(result.enriched.map((item) => item.player.id)).not.toContain("c");
  });
});
