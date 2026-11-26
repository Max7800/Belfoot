import { describe, expect, it } from "vitest";
import { getCompetitionType, isKnockoutPhase, competitionPhases } from "@/lib/competitionType";
import { phaseGroups } from "@/lib/groupedStandings";
import { homeCompetitionFormat } from "@/lib/homeCompetitionFormat";

describe("coupe avec phase de groupes", () => {
  const cup = { competition_type: "cup", ext: { providerType: "Cup" } };
  const match = (home, away) => ({ phase: "Group Stage", home_club_id: home, away_club_id: away, status: "finished", home_score: 1, away_score: 0 });
  const matches = [match("a", "b"), match("a", "c"), match("b", "c"), match("d", "e"), match("d", "f"), match("e", "f"), { phase: "Round of 16" }];

  it("traite les groupes comme un classement et les tours suivants comme une élimination", () => {
    expect(getCompetitionType(cup, matches)).toBe("hybrid");
    expect(isKnockoutPhase("Group Stage")).toBe(false);
    expect(isKnockoutPhase("Round of 16")).toBe(true);
    expect(competitionPhases(matches, "hybrid")).toEqual(["Group Stage", "Round of 16"]);
    expect(phaseGroups(cup, "2026-2027", matches.filter((m) => m.phase === "Group Stage"), {})).toHaveLength(2);
  });

  it("conserve le tableau classique des coupes sans groupes", () => {
    expect(getCompetitionType(cup, [{ phase: "Round of 16" }, { phase: "Final" }])).toBe("cup");
  });

  it("reconnaît les groupes du Mondial sur l'accueil même avec des tours éliminatoires", () => {
    expect(homeCompetitionFormat({ name: "Coupe du monde U17" }, matches)).toEqual({ cup: true, groupPhase: "Group Stage", knockout: false });
    expect(homeCompetitionFormat(cup, [{ phase: "Final" }]).knockout).toBe(true);
  });
});
