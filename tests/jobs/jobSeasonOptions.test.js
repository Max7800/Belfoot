import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { jobSeasonOptions } from "@/lib/importPlan";

// Plan réel du 18/10/2026 (saisons globales).
const PLAN = { version: 4, seasons: [{ label: "2024-2025", enabled: false }, { label: "2025-2026", enabled: true }, { label: "2026-2027", enabled: true }, { label: "2023-2024", role: "added", enabled: true }, { label: "2027-2028", role: "added", enabled: true }] };
const DB = [{ competition_id: "u17", label: "2026-2027" }, { competition_id: "u21", label: "2027-2028" }, { competition_id: "old", label: "2019-2020" }];

describe("jobSeasonOptions — saisons proposées par le panneau Jobs", () => {
  it("une saison ajoutée au plan est proposée même absente de la base (cas U17 2027-2028)", () => {
    expect(jobSeasonOptions({ plan: PLAN, availableSeasons: DB, competitionId: "u17", selected: "2024-2025" })).toEqual(["2027-2028", "2026-2027", "2025-2026", "2024-2025", "2023-2024"]);
  });
  it("saisons déjà en base pour la compétition choisie ajoutées (archives hors plan)", () => {
    expect(jobSeasonOptions({ plan: PLAN, availableSeasons: DB, competitionId: "old" })).toContain("2019-2020");
    expect(jobSeasonOptions({ plan: PLAN, availableSeasons: DB, competitionId: "u17" })).not.toContain("2019-2020");
  });
  it("plan absent (chargement en cours) : saisons de base, comme avant", () => {
    expect(jobSeasonOptions({ plan: null, availableSeasons: [], competitionId: null, selected: "2024-2025" })).toEqual(["2026-2027", "2025-2026", "2024-2025"]);
  });
  it("saison sélectionnée toujours présente, sans doublon, tri décroissant", () => {
    const options = jobSeasonOptions({ plan: PLAN, availableSeasons: DB, competitionId: "u21", selected: "2027-2028" });
    expect(options.filter((label) => label === "2027-2028")).toHaveLength(1);
    expect([...options].sort((a, b) => b.localeCompare(a))).toEqual(options);
  });
  it("saison choisie hors du plan et de la base : conservée (sélecteur cohérent)", () => {
    expect(jobSeasonOptions({ plan: PLAN, availableSeasons: DB, competitionId: "u17", selected: "2018-2019" })).toContain("2018-2019");
  });
  it("le panneau utilise la règle (plus de liste figée)", () => {
    const panel = fs.readFileSync("components/admin/panels.js", "utf8");
    expect(panel).toContain("const seasonOptions = jobSeasonOptions({ plan: importPlan, availableSeasons, competitionId: compId, selected: season });");
    expect(panel).not.toMatch(/"2024-2025", "2025-2026", "2026-2027",\s*\.\.\.availableSeasons/);
  });
});
