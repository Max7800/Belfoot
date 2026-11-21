import { describe, expect, it } from "vitest";
import { defaultCompetitionEstimate, hydrateCompetitionConfig, resolveCompetitionSeasonEstimate } from "@/lib/importPlan";

const worldCup = { external_id: "587", name: "Coupe du monde U17", competition_scope: "international" };

describe("estimations Mondial U17", () => {
  it("donne le format officiel de l'édition 2026", () => {
    expect(defaultCompetitionEstimate(worldCup, "2026-2027")).toEqual({ expected_clubs: 48, expected_matches: 104 });
  });
  it("corrige uniquement les anciennes valeurs génériques pour cette édition", () => {
    const old = { seasons: { "2026-2027": { expected_clubs: 20, expected_matches: 380 } } };
    expect(resolveCompetitionSeasonEstimate(worldCup, old, "2026-2027")).toEqual({ expected_clubs: 48, expected_matches: 104 });
    expect(resolveCompetitionSeasonEstimate(worldCup, old, "2025-2026")).toEqual({ expected_clubs: 20, expected_matches: 380 });
    expect(resolveCompetitionSeasonEstimate({ ...worldCup, external_id: "588" }, old, "2026-2027")).toEqual({ expected_clubs: 20, expected_matches: 380 });
  });
  it("conserve une estimation personnalisée", () => {
    const plan = { seasons: { "2026-2027": { expected_clubs: 47, expected_matches: 100 } } };
    expect(resolveCompetitionSeasonEstimate(worldCup, plan, "2026-2027")).toEqual({ expected_clubs: 47, expected_matches: 100 });
  });
  it("affiche les mêmes valeurs corrigées dans le plan d'import", () => {
    const plan = { seasons: { "2026-2027": { enabled: false, scope: "complete", expected_clubs: 20, expected_matches: 380 } } };
    expect(hydrateCompetitionConfig(worldCup, plan).seasons["2026-2027"]).toMatchObject({ enabled: false, scope: "complete", expected_clubs: 48, expected_matches: 104 });
  });
});
