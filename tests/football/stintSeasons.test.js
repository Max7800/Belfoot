import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { careerStints } from "@/lib/playerCareer";

// Parcours en club (29/10/2026) : club, années et nombre de saisons seulement ;
// les chiffres sont dans « Saison par saison » (sinon doublon).
describe("nombre de saisons d'un passage", () => {
  it("saisons distinctes, pas lignes d'affectation (« PSG · 2 saisons » pour la seule 2026)", () => {
    const [psg, ajax] = careerStints([
      { club_id: "psg", season_start_year: 2026 }, { club_id: "psg", season_start_year: 2026 },
      { club_id: "ajax", season_start_year: 2022 }, { club_id: "ajax", season_start_year: 2023 }, { club_id: "ajax", season_start_year: 2023 }, { club_id: "ajax", season: null },
    ], "psg");
    expect([psg.season_count, ajax.season_count]).toEqual([1, 2]);
    expect(fs.readFileSync("app/players/[id]/page.js", "utf8")).toContain("{stint.season_count > 1 ? ` · ${stint.season_count} saisons` : \"\"}");
  });
});

describe("fiche joueur : parcours sans statistiques", () => {
  const page = fs.readFileSync("app/players/[id]/page.js", "utf8");
  it("plus de tableau de saisons dans les encadrés du parcours", () => {
    expect(page).not.toContain("stintSeasons");
    expect(page).not.toContain("openStints");
    expect(fs.readFileSync("lib/playerCareer.js", "utf8")).not.toContain("export function stintSeasons");
  });
});
