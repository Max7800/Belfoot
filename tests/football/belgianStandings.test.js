import { describe, expect, it } from "vitest";
import { rankBelgianStandings } from "@/lib/belgianStandings";

const competition = (external_id) => ({ provider: "apifootball", external_id });
const row = (club, won, gd, gf) => ({ club, pts: 12, won, gd, gf });

describe("départage belge en saison régulière 2026-2027", () => {
  it.each(["144", "145"])("privilégie les victoires sur la différence de buts (%s)", (id) => {
    const rows = [row("goal-difference", 3, 10, 15), row("wins", 4, -1, 8)];
    expect(rankBelgianStandings(rows, [], competition(id), "2026-2027", "Regular Season").map((item) => item.club)).toEqual(["wins", "goal-difference"]);
    expect(rows[0].club).toBe("goal-difference");
  });
  it("applique les critères à l'extérieur pour la Pro League", () => {
    const rows = [row("a", 3, 2, 5), row("b", 3, 2, 5)];
    const matches = [{ home_club_id: "x", away_club_id: "b", home_score: 0, away_score: 1 }];
    expect(rankBelgianStandings(rows, matches, competition("144"), "2026-2027", "Regular Season").map((item) => item.club)).toEqual(["b", "a"]);
  });
  it("ne réordonne ni les autres compétitions, ni les autres saisons ou phases", () => {
    const rows = [row("a", 1, 10, 15), row("b", 3, -1, 8)];
    for (const [id, season, phase] of [["145", "2025-2026", "Regular Season"], ["145", "2026-2027", "Promotion Play-offs"], ["39", "2026-2027", "Regular Season"]]) {
      expect(rankBelgianStandings(rows, [], competition(id), season, phase)).toBe(rows);
    }
  });
});
