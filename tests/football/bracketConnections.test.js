import { describe, expect, it } from "vitest";
import { confirmedBracketPairs } from "@/lib/bracketConnections";

const fixture = (home_club_id, away_club_id) => ({ home_club_id, away_club_id });

describe("liaisons du tableau final", () => {
  const round = [fixture("Belgique", "Arabie"), fixture("Italie", "Tadjikistan"), fixture("A", "B"), fixture("C", "D")];

  it("relie deux rencontres quand les deux qualifiés sont connus", () => {
    expect(confirmedBracketPairs(round, [fixture("Belgique", "Italie"), fixture("B", "C")])).toEqual([true, true]);
  });

  it("ne déduit pas un parcours de l'ordre du calendrier ou de places à déterminer", () => {
    expect(confirmedBracketPairs(round, [fixture(null, null), fixture("Belgique", "C")])).toEqual([false, false]);
    expect(confirmedBracketPairs(round.slice(0, 1), [fixture("Belgique", "Italie")])).toEqual([false]);
  });
});
