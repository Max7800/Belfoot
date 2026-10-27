import { describe, expect, it } from "vitest";
import { summarizeClubSeason } from "@/lib/clubSeasonWidget";

const match = (id, home, away, homeScore, awayScore, day, extra = {}) => ({ id, home_club_id: home, away_club_id: away, home_score: homeScore, away_score: awayScore, status: "finished", kickoff: `2026-09-${String(day).padStart(2, "0")}T18:00:00Z`, ...extra });
const MATCHES = [
  match("m1", "club", "a", 3, 0, 1), // V dom., sans encaisser, plus large victoire
  match("m2", "b", "club", 2, 2, 8), // N ext.
  match("m3", "club", "c", 0, 1, 15), // D dom., sans marquer
  match("m4", "d", "club", 0, 1, 22), // V ext., sans encaisser
  match("m5", "club", "e", 1, 4, 29), // D dom., plus lourde défaite
  match("m6", "club", "f", 1, 0, 30, { status: "live" }), // en cours (score provisoire) : ignoré
  match("m7", "x", "y", 5, 0, 30), // autre équipe : ignoré
];

describe("saison d'une équipe", () => {
  const summary = summarizeClubSeason({
    clubId: "club",
    matches: [...MATCHES].reverse(), // ordre quelconque : remis dans l'ordre chronologique
    events: [
      { match_id: "m1", club_id: "club", type: "goal", detail: "Normal Goal", minute: 10 },
      { match_id: "m1", club_id: "club", type: "goal", detail: "Own Goal", minute: 44 }, // csc en notre faveur (équipe bénéficiaire)
      { match_id: "m1", club_id: "a", type: "goal", detail: "Missed Penalty", minute: 50 }, // raté : ignoré
      { match_id: "m3", club_id: "c", type: "goal", detail: "Penalty", minute: 90 },
      { match_id: "m5", club_id: "club", type: "yellow", minute: 30 },
      { match_id: "m5", club_id: "club", type: "red", minute: 95 },
      { match_id: "m5", club_id: "e", type: "yellow", minute: 31 }, // carton adverse : ignoré
      { match_id: "m7", club_id: "club", type: "goal", minute: 5 }, // autre match : ignoré
      { match_id: "m2", club_id: "club", type: "goal", minute: null }, // minute inconnue : ignoré
    ],
    lineups: [{ match_id: "m1", club_id: "club", formation: "4-3-3" }, { match_id: "m2", club_id: "club", formation: "4-3-3" }, { match_id: "m3", club_id: "club", formation: "3-5-2" }, { match_id: "m3", club_id: "c", formation: "5-4-1" }],
    teamStats: [{ match_id: "m1", club_id: "club", possession: 60, shots_total: 14, shots_on_goal: 6 }, { match_id: "m2", club_id: "club", possession: 45, shots_total: null }, { match_id: "m2", club_id: "b", possession: 55 }],
  });
  it("bilan domicile / extérieur, matchs à venir et autres équipes ignorés", () => {
    expect(summary.played).toBe(5);
    expect(summary.home).toEqual({ played: 3, wins: 1, draws: 0, losses: 2, goalsFor: 4, goalsAgainst: 5 });
    expect(summary.away).toEqual({ played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 3, goalsAgainst: 2 });
    expect(summary.total).toMatchObject({ wins: 2, draws: 1, losses: 2, goalsFor: 7, goalsAgainst: 7 });
    expect([summary.winShare, summary.cleanSheets, summary.cleanSheetShare, summary.failedToScore]).toEqual([40, 2, 40, 1]);
    expect(summary.averageFor).toBeCloseTo(1.4, 5);
  });
  it("forme : 5 derniers, le plus récent d'abord ; plus large victoire et plus lourde défaite", () => {
    expect(summary.form.map((item) => item.result)).toEqual(["D", "V", "D", "N", "V"]);
    expect(summary.biggestWin).toMatchObject({ margin: 3, goalsFor: 3, goalsAgainst: 0, match: { id: "m1" } });
    expect(summary.biggestLoss).toMatchObject({ margin: -3, goalsFor: 1, goalsAgainst: 4, match: { id: "m5" } });
  });
  it("buts et cartons par tranche de 15 minutes (csc pour l'équipe bénéficiaire, penalty raté exclu)", () => {
    expect(summary.goalsByPeriod.map((p) => [p.scored, p.conceded])).toEqual([[1, 0], [0, 0], [1, 0], [0, 0], [0, 0], [0, 1], [0, 0]]);
    expect(summary.cardsByPeriod.map((p) => [p.yellow, p.red])).toEqual([[0, 0], [1, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 1]]);
  });
  it("formations de l'équipe (part arrondie), moyennes des statistiques collectives", () => {
    expect(summary.formations).toEqual([{ formation: "4-3-3", count: 2, share: 67 }, { formation: "3-5-2", count: 1, share: 33 }]);
    expect(summary.possession).toBe(52.5);
    expect(summary.shots).toBe(14);
    expect(summary.detailedMatches).toBe(2);
  });
  it("aucun match terminé : rien", () => {
    expect(summarizeClubSeason({ clubId: "club", matches: [MATCHES[5]] })).toBeNull();
    expect(summarizeClubSeason()).toBeNull();
  });
  it("égalité d'écart : le score le plus fourni l'emporte", () => {
    const result = summarizeClubSeason({ clubId: "club", matches: [match("a", "club", "x", 2, 0, 1), match("b", "club", "y", 4, 2, 2), match("c", "club", "z", 0, 2, 3), match("d", "club", "w", 1, 3, 4)] });
    expect(result.biggestWin.match.id).toBe("b");
    expect(result.biggestLoss.match.id).toBe("d");
  });
});
