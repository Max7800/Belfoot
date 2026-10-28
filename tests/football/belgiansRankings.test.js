import { describe, expect, it } from "vitest";
import { rankBelgians, seasonTotals } from "@/lib/belgiansRankings";

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

describe("chiffres de saison d'un Belge à l'étranger", () => {
  const stats = [{ season: "2026", appearances: 3, minutes: 270, goals: 1, assists: 0, rating: 7.1 }, { season: "2025", appearances: 30, minutes: 2500, goals: 9, assists: 4, rating: 6.9 }];
  it("compétitions importées d'abord (dernière saison)", () => {
    expect(seasonTotals(stats, { season: "2026-2027", appearances: 12, goals: 5 })).toMatchObject({ season: 2026, appearances: 3, goals: 1, rating: 7.1 });
  });
  it("sinon chiffres du balayage des championnats (championnat non importé)", () => {
    expect(seasonTotals([], { season: "2026-2027", appearances: 12, minutes: 980, goals: 5, assists: 2, rating: 7.25 })).toEqual({ season: 2026, appearances: 12, minutes: 980, goals: 5, assists: 2, rating: 7.25 });
    expect(seasonTotals([], { season: "2026-2027", appearances: 4, rating: 0 }).rating).toBeNull();
    expect(seasonTotals([], { appearances: 0, goals: 0 })).toMatchObject({ appearances: 0 });
    expect(seasonTotals([], null)).toMatchObject({ appearances: 0, goals: 0 });
  });
});
