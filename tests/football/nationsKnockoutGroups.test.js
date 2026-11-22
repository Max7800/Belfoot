import { describe, expect, it } from "vitest";
import { nationsLeagueGroups } from "@/lib/nationsLeague";

describe("classements Nations League", () => {
  it("ne mélange pas les groupes lorsque deux de leurs sélections se retrouvent en quart de finale", () => {
    const groups = [{ label: "League A - Group 1", division: "A", rows: [{ club: "a" }, { club: "b" }] }];
    const competition = { ext: { standings_by_season: { "2026-2027": groups } } };
    const games = [{ home_club_id: "a", away_club_id: "b", status: "finished", home_score: 1, away_score: 0, phase: "League A - Group 1" }, { home_club_id: "a", away_club_id: "b", status: "finished", home_score: 0, away_score: 3, phase: "Quarter-finals" }];
    const result = nationsLeagueGroups(competition, "2026-2027", games);
    expect(result[0].rows.find((row) => row.club === "a").pts).toBe(3);
    expect(result[0].rows.find((row) => row.club === "a").played).toBe(1);
  });
});
