import { describe, expect, it } from "vitest";
import { isMatchOver } from "@/lib/matchStatus";
import { computeStandings } from "@/lib/standings";

describe("résultats incomplets dans les classements", () => {
  const match = { home_club_id: "home", away_club_id: "away", home_score: 2, away_score: null, status: "finished", kickoff: "2026-01-01T12:00:00Z" };
  it("ne considère pas terminé un match dont il manque un score", () => {
    expect(isMatchOver(match)).toBe(false);
    expect(isMatchOver({ ...match, home_score: null, away_score: 0 })).toBe(false);
    expect(isMatchOver({ ...match, status: "scheduled" })).toBe(false);
  });
  it("ne calcule aucun point ni but depuis un score partiel", () => {
    expect(computeStandings([match])).toEqual([]);
    expect(computeStandings([{ ...match, home_score: null, away_score: 0 }])).toEqual([]);
  });
  it("conserve les matchs complets, y compris les scores nuls à zéro", () => {
    const draw = { ...match, home_score: 0, away_score: 0 };
    expect(isMatchOver(draw)).toBe(true);
    expect(computeStandings([draw]).map(({ played, pts, gf, ga }) => ({ played, pts, gf, ga }))).toEqual([
      { played: 1, pts: 1, gf: 0, ga: 0 }, { played: 1, pts: 1, gf: 0, ga: 0 },
    ]);
  });
});
