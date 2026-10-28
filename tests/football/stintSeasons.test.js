import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { careerStints, stintSeasons } from "@/lib/playerCareer";

// Parcours : matchs, buts, passes et note de chaque saison dans chaque club (28/10/2026).
const memberships = [
  { club_id: "ajax", season_start_year: 2023 }, { club_id: "ajax", season_start_year: 2024 }, { club_id: "ajax", season_start_year: 2025 },
  { club_id: "psg", season_start_year: 2026 },
];
const stats = [
  { club_id: "ajax", season: "2024", appearances: 30, minutes: 2200, goals: 6, assists: 4, rating: 7.0 },
  { club_id: "ajax", season: "2024", appearances: 10, minutes: 700, goals: 2, assists: 1, rating: 8.0 }, // Ligue Europa, même saison
  { club_id: "ajax", season: "2025", appearances: 0, minutes: 0, goals: 0, assists: 0, rating: null },
  { club_id: "ajax", season: "2022", appearances: 5, goals: 1, assists: 0 }, // hors de ce passage
  { club_id: "bel", season: "2024", appearances: 4, goals: 1 }, // sélection : autre « club »
  { club_id: "psg", season: "2026", appearances: 1, minutes: 26, goals: 0, assists: 0, rating: 2.4 },
];

describe("saisons d'un passage en club", () => {
  const [psg, ajax] = careerStints(memberships, "psg");
  it("toutes compétitions additionnées par saison, note pondérée par les matchs, plus récente d'abord", () => {
    expect(stintSeasons(ajax, stats)).toEqual([{ year: 2024, label: "2024-2025", appearances: 40, minutes: 2900, goals: 8, assists: 5, rating: 7.25 }]);
    expect(stintSeasons(psg, stats)).toEqual([{ year: 2026, label: "2026-2027", appearances: 1, minutes: 26, goals: 0, assists: 0, rating: 2.4 }]);
  });
  it("saison sans match ou hors du passage écartée ; sans stats : rien ; note absente : null", () => {
    expect(stintSeasons(ajax, stats).map((line) => line.year)).toEqual([2024]);
    expect(stintSeasons(ajax, [])).toEqual([]);
    expect(stintSeasons(ajax, [{ club_id: "ajax", season: "2023", appearances: 3, goals: 0, assists: 0, rating: 0 }])[0].rating).toBeNull();
    expect(stintSeasons(null, stats)).toEqual([]);
    expect(stintSeasons(ajax, [{ club_id: "ajax", season: "2023", appearances: 3 }, { club_id: "ajax", season: "2025", appearances: 2 }]).map((line) => line.label)).toEqual(["2025-2026", "2023-2024"]);
  });
  it("fiche joueur : saisons affichées sous chaque club du parcours", () => {
    const page = fs.readFileSync("app/players/[id]/page.js", "utf8");
    expect(page).toContain("const allSeasons = stintSeasons(stint, state.stats);");
    expect(page).toContain("const seasons = openStints.has(stintKey) ? allSeasons : allSeasons.slice(0, VISIBLE_LINES);");
    expect(page).toContain("{seasons.map((line) => <Fragment key={line.year}>");
  });
});

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
