import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { dedupeSeasonStats, groupStatsBySeason, seasonDisplay } from "@/lib/playerSeasons";

// Doublons de la source relevés le 29/10/2026 (5 793 lignes des Belges suivis).
const competitions = {
  prem: { id: "prem", name: "Premiership", competition_type: "league" },
  fa: { id: "fa", name: "FA Cup", competition_type: "cup" },
  lc: { id: "lc", name: "League Cup", competition_type: "league" }, // mal typée par la source : le nom fait foi
  sa: { id: "sa", name: "Serie A", competition_type: "league" },
  pro: { id: "pro", name: "Pro League", competition_type: "league" },
  uel: { id: "uel", name: "Europa League", competition_type: "cup" },
  unl: { id: "unl", name: "UEFA Nations League", competition_type: "cup" },
};
const stat = (id, competition_id, club_id, season, appearances, minutes, goals, assists, extra = {}) => ({ id, competition_id, club_id, season, appearances, minutes, goals, assists, ...extra });

describe("copies d'un championnat (A. Engels)", () => {
  const engels = [
    stat("p24", "prem", "celtic", "2024", 35, 2135, 9, 6), stat("fa24", "fa", "celtic", "2024", 35, 2135, 9, 6), stat("lc24", "lc", "celtic", "2024", 35, 2135, 9, 6),
    stat("lc25", "lc", "celtic", "2025", 35, 2135, 9, 6), stat("p25", "prem", "celtic", "2025", 30, 2011, 5, 3), stat("uel25", "uel", "celtic", "2025", 8, 555, 1, 3),
  ];
  it("coupes qui recopient la Premiership retirées, même d'une autre saison ; vraies lignes gardées", () => {
    expect(dedupeSeasonStats(engels, competitions).map((row) => row.id)).toEqual(["p24", "p25", "uel25"]);
  });
  it("2025 : 38 matchs (30 + 8), plus 83", () => {
    const season2025 = groupStatsBySeason(dedupeSeasonStats(engels, competitions)).find((season) => season.year === 2025);
    expect(season2025.totals.appearances).toBe(38);
  });
  it("deux championnats identiques gardés (M. Svilar, 38 matchs complets deux saisons) ; moins de 3 matchs : jamais retiré", () => {
    const svilar = [stat("a", "sa", "roma", "2024", 38, 3420, 0, 0), stat("b", "sa", "roma", "2025", 38, 3420, 0, 0)];
    expect(dedupeSeasonStats(svilar, competitions)).toHaveLength(2);
    expect(dedupeSeasonStats([stat("x", "prem", "c", "2024", 2, 71, 0, 0), stat("y", "fa", "c", "2024", 2, 71, 0, 0)], competitions)).toHaveLength(2);
  });
});

describe("même championnat, deux clubs (A. Bertaccini)", () => {
  const bertaccini = [stat("and", "pro", "rsca", "2024", 33, 2656, 18, 4), stat("stvv", "pro", "stvv", "2024", 33, 2765, 21, 4), stat("and25", "pro", "rsca", "2025", 32, 1576, 6, 1), stat("stvv25", "pro", "stvv", "2025", 1, 27, 1, 1)];
  it("lignes voisines (≥ 10 matchs, écart ≤ 25 %) : la moins jouée marquée doublon ; un vrai transfert en cours de saison reste", () => {
    const rows = dedupeSeasonStats(bertaccini, competitions);
    // 33 matchs des deux côtés : le plus de minutes fait foi (Saint-Trond, 2 765 min).
    expect(rows.filter((row) => row.duplicateOf).map((row) => [row.id, row.duplicateOf])).toEqual([["and", "stvv"]]);
    expect(rows).toHaveLength(4); // rien n'est supprimé
  });
  it("total de la saison : 33 matchs, plus 66 ; 2025 : 33 (32 + 1, vrai transfert)", () => {
    const seasons = groupStatsBySeason(dedupeSeasonStats(bertaccini, competitions));
    expect(seasons.find((season) => season.year === 2024).totals.appearances).toBe(33);
    expect(seasons.find((season) => season.year === 2025).totals.appearances).toBe(33);
  });
  it("écart trop grand (11 et 19 matchs) : deux passages réels, aucun doublon", () => {
    expect(dedupeSeasonStats([stat("a", "pro", "x", "2025", 19, 1500, 1, 0), stat("b", "pro", "y", "2025", 11, 800, 0, 0)], competitions).some((row) => row.duplicateOf)).toBe(false);
  });
});

describe("détail d'une saison à l'écran", () => {
  const clubs = { rsca: { id: "rsca", name: "Anderlecht", team_type: "first_team" }, stvv: { id: "stvv", name: "St. Truiden", team_type: "first_team" }, bel: { id: "bel", name: "Belgique", team_type: "national" } };
  it("clubs de la saison (le plus joué d'abord, doublon exclu), club puis sélection, lignes vides retirées", () => {
    const rows = [stat("n", "unl", "bel", "2024", 4, 185, 0, 0), stat("f", "fa", "bel", "2024", 0, 0, 0, 0), stat("s", "pro", "stvv", "2024", 33, 2765, 21, 4, { duplicateOf: "a" }), stat("a", "pro", "rsca", "2024", 33, 2656, 18, 4), stat("u", "uel", "rsca", "2024", 8, 600, 1, 0)];
    const display = seasonDisplay(rows, clubs);
    expect(display.clubIds).toEqual(["rsca"]);
    expect(display.clubRows.map((row) => row.id)).toEqual(["s", "a", "u"]);
    expect(display.nationalRows.map((row) => row.id)).toEqual(["n"]);
  });
  it("vrai transfert en cours de saison : les deux clubs, le plus joué d'abord", () => {
    expect(seasonDisplay([stat("a", "pro", "stvv", "2025", 1, 27, 1, 1), stat("b", "pro", "rsca", "2025", 32, 1576, 6, 1)], clubs).clubIds).toEqual(["rsca", "stvv"]);
  });
  it("matchs amicaux : affichés, hors du total de la saison", () => {
    const rows = [stat("p", "pro", "rsca", "2025", 30, 2500, 5, 3), stat("f", "fr", "rsca", "2025", 2, 71, 0, 0)];
    const [season] = groupStatsBySeason(rows, { ...competitions, fr: { id: "fr", name: "Friendlies Clubs", competition_type: "league" } });
    expect(season.totals.appearances).toBe(30);
    expect(season.rows.map((row) => row.id)).toEqual(["p", "f"]);
  });
  it("fiche : doublons traités une fois pour toute la fiche, signalés, hors des chiffres de la saison en cours", () => {
    const page = fs.readFileSync("app/players/[id]/page.js", "utf8");
    expect(page).toContain("stats: dedupeSeasonStats(withLeague.stats, withLeague.competitions),");
    expect(page).toContain(".filter((row) => !row.duplicateOf);");
    expect(page).toContain("doublon probable de la source, non compté");
    expect(page).toContain("const display = seasonDisplay(season.rows, clubs);");
  });
});
