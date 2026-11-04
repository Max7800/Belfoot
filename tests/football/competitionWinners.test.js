import { describe, expect, it } from "vitest";
import { recentCompetitionWinners, validateCompetitionWinners } from "@/lib/competitionWinners";

describe("vainqueurs renseignés par compétition", () => {
  it("trie les saisons du plus récent au plus ancien et limite l'affichage", () => {
    const rows = [2021, 2024, 2019, 2023, 2020, 2022].map((year) => ({ season: `${year}-${year + 1}`, winner: `Club ${year}` }));
    expect(recentCompetitionWinners(rows).map((row) => row.season)).toEqual(["2024-2025", "2023-2024", "2022-2023", "2021-2022", "2020-2021"]);
    expect(rows[0].season).toBe("2021-2022");
    expect(recentCompetitionWinners(rows, Infinity)).toHaveLength(6);
  });
  it("refuse saisons invalides, doublons, noms vides et liens dangereux", () => {
    expect(validateCompetitionWinners([{ season: "2025-2027", winner: "A" }])).toBeTruthy();
    expect(validateCompetitionWinners([{ season: "2025", winner: " " }])).toBeTruthy();
    expect(validateCompetitionWinners([{ season: "2025", winner: "A" }, { season: " 2025 ", winner: "B" }])).toBeTruthy();
    expect(validateCompetitionWinners([{ season: "2025", winner: "A", source: "javascript:alert(1)" }])).toBeTruthy();
    expect(validateCompetitionWinners([{ season: "2025", winner: "A", source: "https://example.org" }])).toBeNull();
  });
  it("n'invente rien et écarte les saisons ambiguës ou les données corrompues", () => {
    expect(recentCompetitionWinners(null)).toEqual([]);
    expect(recentCompetitionWinners([{ season: "2024", winner: "A" }, { season: "2024", winner: "B" }, null, { season: 2025, winner: "A" }, { season: "2023", winner: "C" }])).toEqual([{ season: "2023", winner: "C" }]);
  });
});
