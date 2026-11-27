import { describe, expect, it } from "vitest";
import { competitionPhases, getCompetitionType, isKnockoutPhase } from "@/lib/competitionType";

const challenger = { provider: "apifootball", external_id: "145", competition_scope: "belgique", competition_type: "league", ext: { providerType: "League" } };
const match = (phase) => ({ phase, kickoff: "2027-05-01T18:00:00Z" });

describe("Challenger Pro League : phases de promotion", () => {
  it("montre une phase régulière et des demi-finales/finales comme deux formats", () => {
    const matches = [match("Regular Season"), match("Promotion Play-offs - Semi-finals"), match("Promotion Play-offs - Final")];
    expect(getCompetitionType(challenger, matches)).toBe("hybrid");
    expect(competitionPhases(matches, "hybrid")).toEqual(["Regular Season", "Promotion Play-offs - Semi-finals", "Promotion Play-offs - Final"]);
    expect(isKnockoutPhase(matches[1].phase)).toBe(true);
  });
  it("garde un championnat pour un groupe de promotion ou le début de saison", () => {
    expect(getCompetitionType(challenger, [match("Regular Season"), match("Promotion Play-offs")])).toBe("league");
    expect(getCompetitionType(challenger, [match("Regular Season")])).toBe("league");
  });
  it("ne change pas une autre compétition homonyme ou étrangère", () => {
    const matches = [match("Promotion Play-offs - Semi-finals")];
    expect(getCompetitionType({ ...challenger, external_id: "144" }, matches)).toBe("league");
    expect(getCompetitionType({ ...challenger, provider: "other" }, matches)).toBe("league");
  });
});
