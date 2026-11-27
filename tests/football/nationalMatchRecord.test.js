import { describe, expect, it } from "vitest";
import { belgianCalendarYear, nationalMatchRecord } from "@/lib/nationalMatchRecord";

describe("bilan des rencontres nationales", () => {
  it("compte les scores connus de la sélection à domicile et à l'extérieur", () => {
    const rows = [
      { status: "finished", home_club_id: "be", away_club_id: "x", home_score: 2, away_score: 1 },
      { status: "finished", home_club_id: "x", away_club_id: "be", home_score: 1, away_score: 3 },
      { status: "finished", home_club_id: "be", away_club_id: "x", home_score: 0, away_score: 0 },
      { status: "finished", home_club_id: "be", away_club_id: "x", home_score: 2, away_score: null },
      { status: "live", home_club_id: "be", away_club_id: "x", home_score: 4, away_score: 0 },
      { status: "finished", home_club_id: "x", away_club_id: "y", home_score: 1, away_score: 0 },
    ];
    expect(nationalMatchRecord(rows, "be")).toEqual({ matches: 4, wins: 2, goals: 5, scoredMatches: 3 });
  });
  it("change d'année au 1er janvier en Belgique", () => {
    expect(belgianCalendarYear(new Date("2026-12-31T22:59:59Z")).year).toBe(2026);
    expect(belgianCalendarYear(new Date("2026-12-31T23:00:00Z"))).toEqual({ year: 2027, from: "2026-12-31T23:00:00.000Z", to: "2027-12-31T23:00:00.000Z" });
  });
});
