import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { isMatchPending, isMatchPostponed, isMatchStarted, isMatchVoid, isSeasonOver, nextMatchday, upcomingMatches } from "@/lib/matchdays";

const NOW = Date.parse("2026-10-17T15:00:00Z"); // samedi
const H = 3600000;
const at = (offsetHours) => new Date(NOW + offsetHours * H).toISOString();

let seq = 0;
const match = (round, offsetHours, extra = {}) => ({ id: `m${++seq}`, round_number: round, kickoff: offsetHours == null ? null : at(offsetHours), status: "scheduled", home_score: null, away_score: null, ext: {}, ...extra });
const played = (round, offsetHours, extra = {}) => match(round, offsetHours, { status: "finished", home_score: 1, away_score: 0, ext: { status_short: "FT" }, ...extra });
const ids = (rows) => rows.map((row) => row.id);

describe("nextMatchday — journée en cours → journée complète suivante", () => {
  it("début de saison : première journée complète", () => {
    const j1 = [match(1, 24), match(1, 26)]; const j2 = [match(2, 24 * 7)];
    expect(nextMatchday([...j2, ...j1], NOW)).toEqual({ round: 1, matches: j1 });
  });

  it("journée terminée : journée suivante", () => {
    const rows = [played(9, -24 * 7), played(9, -24 * 6), match(10, 24), match(10, 48)];
    expect(nextMatchday(rows, NOW).round).toBe(10);
  });

  it("journée entamée (un match joué, d'autres à venir) : la SUIVANTE complète, pas le reliquat", () => {
    const j11 = [match(11, 24 * 7), match(11, 24 * 7 + 2), match(11, 24 * 8)];
    const rows = [played(10, -20), match(10, 3), match(10, 26), ...j11];
    expect(nextMatchday(rows, NOW)).toEqual({ round: 11, matches: j11 });
  });

  it("journée entamée par un direct : la suivante", () => {
    const rows = [match(10, -1, { status: "live", home_score: 0, away_score: 0, ext: { status_short: "2H" } }), match(10, 24), match(11, 24 * 7)];
    expect(nextMatchday(rows, NOW).round).toBe(11);
  });

  it("coup d'envoi passé sans mise à jour du statut : la journée est entamée", () => {
    const rows = [match(10, -0.25), match(10, 24), match(11, 24 * 7)];
    expect(nextMatchday(rows, NOW).round).toBe(11);
  });

  it("match interrompu (SUSP, rangé en « postponed » par la synchro) : la journée est entamée", () => {
    const rows = [match(10, -1, { status: "postponed", home_score: 1, away_score: 1, ext: { status_short: "SUSP" } }), match(10, 24), match(11, 24 * 7)];
    expect(nextMatchday(rows, NOW).round).toBe(11);
  });

  it("un match reporté sans date ne retient pas la carte sur une ancienne journée", () => {
    const rows = [played(8, -24 * 14), match(8, -24 * 14, { status: "postponed", ext: { status_short: "PST" } }), played(9, -24 * 7), match(10, 24)];
    expect(nextMatchday(rows, NOW).round).toBe(10);
  });

  it("un match annulé ou abandonné ne retient pas la carte", () => {
    const rows = [played(8, -24 * 14), match(8, -24 * 14, { status: "postponed", ext: { status_short: "CANC" } }), match(8, -24 * 14, { status: "postponed", ext: { status_short: "ABD" } }), match(9, 24)];
    expect(nextMatchday(rows, NOW).round).toBe(9);
  });

  it("un direct bloqué (live depuis deux jours, sans score final) ne retient pas la carte", () => {
    const rows = [match(9, -48, { status: "live", ext: { status_short: "1H" } }), played(9, -48), match(10, 24)];
    expect(nextMatchday(rows, NOW).round).toBe(10);
  });

  it("un match programmé jamais mis à jour (coup d'envoi dépassé de jours) ne retient pas la carte", () => {
    const rows = [match(9, -24 * 5), played(9, -24 * 5), match(10, 24)];
    expect(nextMatchday(rows, NOW).round).toBe(10);
  });

  it("un match d'une ancienne journée reprogrammé plus tard ne fait pas reculer la carte", () => {
    const rows = [played(8, -24 * 14), match(8, 4), played(9, -24 * 7), played(10, -24), match(11, 24 * 6)];
    expect(nextMatchday(rows, NOW).round).toBe(11);
  });

  it("une journée entièrement reprogrammée avant la suivante est la prochaine, par date", () => {
    const rows = [played(9, -24 * 7), match(5, 24 * 3), match(5, 24 * 3 + 2), match(10, 24 * 6)];
    expect(nextMatchday(rows, NOW).round).toBe(5);
  });

  it("une journée reprogrammée APRÈS la suivante ne retient pas la carte", () => {
    const rows = [played(9, -24 * 7), match(5, 24 * 10), match(10, 24 * 6)];
    expect(nextMatchday(rows, NOW).round).toBe(10);
  });

  it("la journée affichée est complète, match reporté compris, triée par date (sans date en dernier)", () => {
    const late = match(11, 24 * 8); const tbd = match(11, null); const pst = match(11, 24 * 7, { status: "postponed", ext: { status_short: "PST" } }); const early = match(11, 24 * 6);
    const rows = [played(10, -24), late, tbd, pst, early];
    expect(ids(nextMatchday(rows, NOW).matches)).toEqual(ids([early, pst, late, tbd]));
  });

  it("score final et coup d'envoi > 3 h sans statut finalisé : joué (règle isMatchOver)", () => {
    const rows = [match(10, -24, { home_score: 2, away_score: 2 }), match(10, -23, { home_score: 0, away_score: 1 }), match(11, 24)];
    expect(nextMatchday(rows, NOW).round).toBe(11);
  });

  it("journée composée uniquement de matchs reportés : ignorée", () => {
    const rows = [played(9, -24), match(10, 24, { status: "postponed", ext: { status_short: "PST" } }), match(11, 24 * 7)];
    expect(nextMatchday(rows, NOW).round).toBe(11);
  });

  it("dernière journée entamée : aucune journée suivante (repli sur les prochains matchs)", () => {
    const rows = [played(34, -20), match(34, 26), match(34, 3)];
    expect(nextMatchday(rows, NOW)).toBeNull();
    expect(ids(upcomingMatches(rows, NOW))).toEqual([rows[2].id, rows[1].id]);
  });

  it("sans numéro de journée (coupe) : null", () => {
    expect(nextMatchday([match(null, 24), match(undefined, 48)], NOW)).toBeNull();
  });
});

describe("upcomingMatches", () => {
  it("garde les matchs réellement à venir ou en direct, par date, limités", () => {
    const live = match(null, -1, { status: "live", home_score: 0, away_score: 0, ext: { status_short: "1H" } });
    const soon = match(null, 2); const later = match(null, 30); const tbd = match(null, null);
    const rows = [later, played(null, -24), match(null, -48, { status: "live" }), match(null, -24 * 5), match(null, 5, { status: "postponed", ext: { status_short: "PST" } }), tbd, soon, live];
    expect(ids(upcomingMatches(rows, NOW))).toEqual(ids([live, soon, later, tbd]));
    expect(upcomingMatches(rows, NOW, 2)).toHaveLength(2);
  });
});

describe("isSeasonOver", () => {
  it("tous les matchs joués ou annulés : terminée", () => {
    expect(isSeasonOver([played(1, -48), match(1, -48, { status: "postponed", ext: { status_short: "CANC" } }), match(2, -24, { home_score: 1, away_score: 1 })], NOW)).toBe(true);
  });
  it("un match reporté reste à jouer : pas terminée", () => {
    expect(isSeasonOver([played(1, -48), match(1, -48, { status: "postponed", ext: { status_short: "PST" } })], NOW)).toBe(false);
  });
  it("un direct en cours : pas terminée", () => {
    expect(isSeasonOver([played(1, -48), match(2, -1, { status: "live", home_score: 1, away_score: 0 })], NOW)).toBe(false);
  });
  it("aucun match : pas terminée", () => {
    expect(isSeasonOver([], NOW)).toBe(false);
  });
});

describe("classification des statuts", () => {
  it("annulé, abandonné, tapis vert, forfait : ne se jouera plus", () => {
    for (const short of ["CANC", "ABD", "AWD", "WO"]) expect(isMatchVoid(match(1, -1, { ext: { status_short: short } }))).toBe(true);
    expect(isMatchVoid(match(1, -1, { ext: { status_short: "PST" } }))).toBe(false);
  });
  it("reporté : PST ou statut postponed, mais jamais une interruption ni une annulation", () => {
    expect(isMatchPostponed(match(1, 1, { ext: { status_short: "PST" } }))).toBe(true);
    expect(isMatchPostponed(match(1, 1, { status: "postponed" }))).toBe(true);
    expect(isMatchPostponed(match(1, 1, { status: "postponed", ext: { status_short: "INT" } }))).toBe(false);
    expect(isMatchPostponed(match(1, 1, { status: "postponed", ext: { status_short: "CANC" } }))).toBe(false);
  });
  it("commencé / à venir aux bornes", () => {
    expect(isMatchStarted(match(1, 0.01), NOW)).toBe(false);
    expect(isMatchStarted(match(1, 0), NOW)).toBe(true);
    expect(isMatchStarted(match(1, -1, { status: "postponed", ext: { status_short: "PST" } }), NOW)).toBe(false);
    expect(isMatchPending(match(1, -2.9), NOW)).toBe(true);
    expect(isMatchPending(match(1, -3.1), NOW)).toBe(false);
    expect(isMatchPending(match(1, null), NOW)).toBe(true);
  });
  it("lit aussi le statut brut ext.fixture.status.short", () => {
    expect(isMatchVoid(match(1, 1, { ext: { fixture: { status: { short: "canc" } } } }))).toBe(true);
  });
});

describe("page compétition", () => {
  it("la carte utilise la règle partagée et plus le plus petit numéro non « finished »", () => {
    const source = fs.readFileSync("app/competitions/[slug]/page.js", "utf8");
    expect(source).toMatch(/nextMatchday\(phaseMatches, nowMs\)/);
    expect(source).toMatch(/upcomingMatches\(seasonMatches, nowMs\)/);
    expect(source).toMatch(/isSeasonOver\(seasonMatches, nowMs\)/);
    expect(source).not.toMatch(/m\.status !== "finished" && m\.round_number != null/);
  });
});
