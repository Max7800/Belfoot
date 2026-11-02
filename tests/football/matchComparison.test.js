import { describe, expect, it } from "vitest";
import { matchComparison, matchEventSide } from "@/lib/matchComparison";

describe("comparaison des statistiques d'un match", () => {
  it("ne compare pas une valeur inconnue à zéro", () => {
    expect(matchComparison("shots_total", 5, null)).toMatchObject({ home: 5, away: null, comparable: false, homeWidth: 0, awayWidth: 0, leader: null });
    expect(matchComparison("shots_total", 0, 5)).toMatchObject({ comparable: true, homeWidth: 0, awayWidth: 100, leader: "away" });
  });
  it("ne valorise pas un plus grand nombre de fautes ou de cartons", () => {
    for (const field of ["fouls", "offsides", "yellow", "red"]) expect(matchComparison(field, 5, 1).leader).toBeNull();
    expect(matchComparison("shots_total", 5, 1).leader).toBe("home");
  });
  it("limite les pourcentages affichés et ne confond pas le texte non numérique avec zéro", () => {
    expect(matchComparison("possession", 110, 20)).toMatchObject({ homeWidth: 100, awayWidth: 20 });
    expect(matchComparison("possession", "abc", 50).comparable).toBe(false);
  });
  it("ne place pas les faits sans équipe connue du côté extérieur", () => {
    expect(matchEventSide({ club_id: "home" }, "home", "away")).toBe("home");
    expect(matchEventSide({ club_id: "away" }, "home", "away")).toBe("away");
    expect(matchEventSide({ club_id: "unknown" }, "home", "away")).toBeNull();
    expect(matchEventSide({}, "home", "away")).toBeNull();
  });
});
