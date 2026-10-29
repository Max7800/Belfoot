import { describe, expect, it } from "vitest";
import { currentSeasonStart, latestTotals, rankBelgians, seasonTotals } from "@/lib/belgiansRankings";

const item = (id, totals) => ({ player: { id, name: id }, club: { name: "Club" }, totals: { appearances: 0, goals: 0, assists: 0, rating: null, ...totals } });

describe("Les Belges en chiffres", () => {
  const boards = Object.fromEntries(rankBelgians([
    item("Openda", { appearances: 9, goals: 5, assists: 1, rating: 7.1 }),
    item("Doku", { appearances: 8, goals: 2, assists: 4, rating: 7.4 }),
    item("Trossard", { appearances: 2, goals: 2, assists: 0, rating: 8.9 }), // < 3 matchs : hors classement des notes
    item("Banc", { appearances: 5 }),
    ...["A", "B", "C", "D"].map((id) => item(id, { appearances: 4, goals: 1, rating: 6.5 })),
  ]).map((board) => [board.key, board]));
  it("buteurs : 5 premiers, égalité par ordre alphabétique, aucun joueur à 0", () => {
    expect(boards.goals.rows.map((row) => [row.item.player.id, row.value])).toEqual([["Openda", 5], ["Doku", 2], ["Trossard", 2], ["A", 1], ["B", 1]]);
    expect(boards.goals.format(1)).toBe("1 but");
    expect(boards.goals.format(5)).toBe("5 buts");
  });
  it("passeurs et meilleures notes (au moins 3 matchs)", () => {
    expect(boards.assists.rows.map((row) => row.item.player.id)).toEqual(["Doku", "Openda"]);
    expect(boards.rating.rows.map((row) => row.item.player.id)).toEqual(["Doku", "Openda", "A", "B", "C"]);
    expect(boards.rating.format(7.4)).toBe("7.40");
  });
});

const NOW = new Date("2026-10-29T12:00:00Z");

describe("chiffres de saison d'un Belge à l'étranger", () => {
  const stats = [{ season: "2026", appearances: 3, minutes: 270, goals: 1, assists: 0, rating: 7.1 }, { season: "2025", appearances: 30, minutes: 2500, goals: 9, assists: 4, rating: 6.9 }];
  it("compétitions importées d'abord (dernière saison)", () => {
    expect(seasonTotals(stats, { season: "2026-2027", appearances: 12, goals: 5 }, NOW)).toMatchObject({ season: 2026, appearances: 3, goals: 1, rating: 7.1 });
  });
  it("sinon chiffres du balayage des championnats (championnat non importé)", () => {
    expect(seasonTotals([], { season: "2026-2027", appearances: 12, minutes: 980, goals: 5, assists: 2, rating: 7.25 }, NOW)).toEqual({ season: 2026, appearances: 12, minutes: 980, goals: 5, assists: 2, rating: 7.25 });
    expect(seasonTotals([], { season: "2026-2027", appearances: 4, rating: 0 }, NOW).rating).toBeNull();
    expect(seasonTotals([], { appearances: 0, goals: 0 })).toMatchObject({ appearances: 0 });
    expect(seasonTotals([], null)).toMatchObject({ appearances: 0, goals: 0 });
  });
});

describe("saison en cours seulement (import des 5 saisons passées, 29/10/2026)", () => {
  // A. Engels : aucune ligne 2026, six lignes 2025 → « En forme » affichait 83 matchs.
  const engels = [
    { season: "2025", appearances: 30, minutes: 2011, goals: 5, assists: 3, rating: 7 }, { season: "2025", appearances: 35, minutes: 2135, goals: 9, assists: 6 },
    { season: "2025", appearances: 8, minutes: 555, goals: 1, assists: 3 }, { season: "2024", appearances: 35, minutes: 2135, goals: 9, assists: 6 },
  ];
  it("saison en cours = année de début : 2026 d'octobre 2026, 2026 encore en mars 2027, 2027 en août 2027", () => {
    expect(currentSeasonStart(NOW)).toBe(2026);
    expect(currentSeasonStart(new Date("2027-03-01T12:00:00Z"))).toBe(2026);
    expect(currentSeasonStart(new Date("2027-08-01T12:00:00Z"))).toBe(2027);
  });
  it("aucune ligne de la saison en cours : 0, jamais la saison passée", () => {
    expect(latestTotals(engels, NOW)).toMatchObject({ appearances: 0, goals: 0, assists: 0, rating: null });
    expect(seasonTotals(engels, null, NOW)).toMatchObject({ appearances: 0 });
  });
  it("chiffres du balayage de la saison en cours à défaut ; ceux d'une saison passée ignorés", () => {
    expect(seasonTotals(engels, { season: "2026-2027", appearances: 9, goals: 2 }, NOW)).toMatchObject({ season: 2026, appearances: 9, goals: 2 });
    expect(seasonTotals(engels, { season: "2025-2026", appearances: 30, goals: 9 }, NOW)).toMatchObject({ appearances: 0 });
  });
  it("championnat en année civile (MLS « 2026 ») et ligne 2026-2027 additionnés comme saison en cours", () => {
    expect(latestTotals([{ season: "2026", appearances: 20, goals: 4 }, { season: "2026-2027", appearances: 3, goals: 1 }, ...engels], NOW)).toMatchObject({ season: 2026, appearances: 23, goals: 5 });
  });
  it("accueil : même calcul, chiffres du balayage lus", async () => {
    const fs = await import("node:fs");
    const home = fs.readFileSync("app/page.js", "utf8");
    expect(home).toContain("return seasonTotals(preferAssignedPlayerStats(rows), leagueStats);");
    expect(home).toContain("totals: latestPlayerTotals(rows, player.league_stats)");
    expect(home).toContain("league_stats:ext->league_stats");
  });
});
