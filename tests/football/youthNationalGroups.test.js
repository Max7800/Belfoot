import { describe, expect, it } from "vitest";
import { classifyNationalTeams, nationalTeamPatch } from "@/modules/football/nationalClassification";
import { groupDisplayLabel, mergeGroupStagePhases, phaseGroups } from "@/lib/groupedStandings";
import { selectionGroupStanding } from "@/lib/selectionGroup";
import { isKnockoutPhase } from "@/lib/competitionType";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// ── Sélections : l'API déclare parfois « national: false » (Pays-Bas U19, Danemark U17…)
describe("classement des participants d'une compétition de sélections", () => {
  const row = (id, ext, name, extra = {}) => ({ id, source: "apifootball", external_id: ext, name, team_type: "first_team", national_category: null, national_gender: null, locked: false, ...extra });
  it("sans l'option : seules les équipes déclarées « national » par l'API (comportement existant)", () => {
    expect(nationalTeamPatch(row("a", "1", "Netherlands U19"), { name: "Netherlands U19", national: false })).toEqual({});
  });
  it("compétition de sélections : tout participant devient sélection, catégorie et genre du nom", () => {
    expect(nationalTeamPatch(row("a", "1", "Netherlands U19"), { name: "Netherlands U19", national: false }, { allParticipants: true })).toEqual({ team_type: "national", national_category: "u19", national_gender: "men" });
    expect(nationalTeamPatch(row("b", "2", "Denmark U17", { team_type: "youth" }), { name: "Denmark U17" }, { allParticipants: true })).toEqual({ team_type: "national", national_category: "u17", national_gender: "men" });
  });
  it("ligne verrouillée jamais modifiée ; valeurs existantes jamais écrasées", () => {
    expect(nationalTeamPatch(row("a", "1", "Netherlands U19", { locked: true }), { name: "Netherlands U19" }, { allParticipants: true })).toEqual({});
    expect(nationalTeamPatch(row("a", "1", "Kosovo U21", { team_type: "national", national_category: "u21", national_gender: "men" }), { name: "Kosovo U21" }, { allParticipants: true })).toEqual({});
  });
  it("classifyNationalTeams : participants du calendrier reclassés en base", async () => {
    const db = createFakeSupabase({ clubs: [row("nl", "10340", "Netherlands U19"), row("dk", "17948", "Denmark U17", { team_type: "youth" }), row("bk", "999", "Club Brugge")] });
    const n = await classifyNationalTeams(db, "apifootball", [{ external_id: "10340", name: "Netherlands U19" }, { external_id: "17948", name: "Denmark U17" }], { allParticipants: true });
    expect(n).toBe(2);
    const byExt = Object.fromEntries(db.rows("clubs").map((c) => [c.external_id, c]));
    expect(byExt["10340"]).toMatchObject({ team_type: "national", national_category: "u19" });
    expect(byExt["17948"]).toMatchObject({ team_type: "national", national_category: "u17" });
    expect(byExt["999"].team_type).toBe("first_team"); // hors participants : intact
  });
});

describe("syncCompetition — branchement", () => {
  it("compétition de sélections : participants du calendrier classés avec allParticipants", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync("modules/football/syncCompetition.js", "utf8").split(String.fromCharCode(13)).join("");
    expect(source).toContain("if (isNationalTeamsCompetition(competition)) {\n    await classifyNationalTeams(db, competition.provider, [...derived.values()], { allParticipants: true });");
  });
});

// ── Groupes sur plusieurs tours (format UEFA de jeunes) ─────────────────────
let seq = 0;
const game = (phase, home, away, kickoff, homeScore = 1, awayScore = 0) => ({ id: `m${++seq}`, phase, home_club_id: home, away_club_id: away, home_score: homeScore, away_score: awayScore, status: homeScore == null ? "scheduled" : "finished", kickoff, ext: {} });
const r = (club, rank, pts, played, extra = {}) => ({ club, rank, pts, played, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, ...extra });
// Tour 1 : groupes {a,b,c} et {d,e,f} ; tour 2 : League A {a,d,x} et League B {b,e,y}.
const STANDINGS = { "2026-2027": [
  { label: "U17 European Championship, Qualification 2026, Group 1", rows: [r("a", 1, 3, 2), r("b", 2, 3, 2), r("c", 3, 0, 2)] },
  { label: "U17 European Championship, Qualification 2026, Group 2", rows: [r("d", 1, 3, 2), r("e", 2, 3, 2), r("f", 3, 0, 2)] },
  { label: "U17 UEFA European Championship, Qualification 2026, League A, Group 1", rows: [r("a", 1, 3, 1), r("d", 2, 0, 1), r("x", 3, 0, 0)] },
  { label: "U17 UEFA European Championship, Qualification 2026, League B, Group 1", rows: [r("b", 1, 3, 1), r("e", 2, 0, 1), r("y", 3, 0, 0)] },
] };
const U17 = { id: "c-886", name: "UEFA U17", ext: { standings_by_season: STANDINGS } };
const twoRounds = () => { seq = 0; return [
  game("Group Stage", "a", "b", "2025-10-01T10:00:00Z"), game("Group Stage", "b", "c", "2025-10-04T10:00:00Z"), game("Group Stage", "a", "c", "2025-10-07T10:00:00Z", 2, 0),
  game("Group Stage", "d", "e", "2025-10-01T14:00:00Z"), game("Group Stage", "e", "f", "2025-10-04T14:00:00Z"), game("Group Stage", "d", "f", "2025-10-07T14:00:00Z", 2, 0),
  game("Group Stage", "a", "d", "2026-03-20T10:00:00Z"), game("Group Stage", "b", "e", "2026-03-20T14:00:00Z"),
  game("Group Stage", "x", "a", "2026-03-23T10:00:00Z", null, null), game("Group Stage", "y", "b", "2026-03-23T14:00:00Z", null, null),
]; };

describe("groupes sur plusieurs tours", () => {
  it("chaque match rattaché à son groupe officiel : 4 groupes, tour 1 d'abord", () => {
    const groups = phaseGroups(U17, "2026-2027", twoRounds(), {});
    expect(groups.map((g) => groupDisplayLabel(g.label))).toEqual(["Groupe 1", "Groupe 2", "League A · Groupe 1", "League B · Groupe 1"]);
    expect(groups.every((g) => g.official)).toBe(true);
  });
  it("les points d'un groupe ne comptent que ses propres matchs", () => {
    const leagueA = phaseGroups(U17, "2026-2027", twoRounds(), {}).find((g) => /League A/.test(g.label));
    expect(leagueA.rows.map((row) => row.club).sort()).toEqual(["a", "d", "x"]);
  });
  it("un match hors de tout groupe officiel : pas de rattachement hasardeux", () => {
    const groups = phaseGroups(U17, "2026-2027", [...twoRounds(), game("Group Stage", "c", "x", "2026-04-01T10:00:00Z")], {});
    expect(groups.some((g) => g.official)).toBe(false);
  });
  it("sélection présente dans deux groupes : celui de son dernier match", () => {
    const g = selectionGroupStanding({ competition: U17, seasonLabel: "2026-2027", matches: twoRounds(), teamId: "a", isKnockout: isKnockoutPhase });
    expect(groupDisplayLabel(g.label)).toBe("League A · Groupe 1");
  });
  it("libellés : la ligue est conservée, sinon libellé historique inchangé", () => {
    expect(groupDisplayLabel("League A R1, Group 5")).toBe("League A · Groupe 5");
    expect(groupDisplayLabel("U17 UEFA European Championship, Qualification 2026, League B, Group 4")).toBe("League B · Groupe 4");
    expect(groupDisplayLabel("Group I")).toBe("Groupe I");
    expect(groupDisplayLabel("Ranking of second-placed teams")).toBe("Classement des deuxièmes");
  });
});

describe("fusion des phases — jamais sous un nom déjà porté (U19 2027-2028)", () => {
  // League A et League B (groupes disjoints) + 78 matchs « Group Stage » du cycle suivant.
  const standings = { "2027-2028": [
    { label: "League A R1, Group 1", rows: [r("a", 1, 0, 0), r("b", 2, 0, 0), r("c", 3, 0, 0)] },
    { label: "League B R1, Group 1", rows: [r("d", 1, 0, 0), r("e", 2, 0, 0), r("f", 3, 0, 0)] },
  ] };
  const comp = { id: "c-893", name: "UEFA U19", ext: { standings_by_season: standings } };
  const matches = () => { seq = 0; return [
    game("Qualification - Round 1 - League A", "a", "b", "2026-03-25T10:00:00Z"), game("Qualification - Round 1 - League A", "b", "c", "2026-03-28T10:00:00Z"),
    game("Qualification - Round 1 - League B", "d", "e", "2026-03-25T14:00:00Z"), game("Qualification - Round 1 - League B", "e", "f", "2026-03-28T14:00:00Z"),
    game("Group Stage", "a", "x", "2026-11-11T10:00:00Z", null, null), game("Group Stage", "d", "y", "2026-11-11T14:00:00Z", null, null),
  ]; };
  it("League A et League B restent distinctes du « Group Stage » existant", () => {
    const input = matches();
    expect(mergeGroupStagePhases(comp, "2027-2028", input, { isKnockout: isKnockoutPhase })).toBe(input);
  });
  it("sans phase concurrente, la fusion reste possible (U21 2023 inchangée)", () => {
    const input = matches().filter((m) => m.phase !== "Group Stage");
    expect(new Set(mergeGroupStagePhases(comp, "2027-2028", input, { isKnockout: isKnockoutPhase }).map((m) => m.phase))).toEqual(new Set(["Group Stage"]));
  });
});

describe("groupes sur plusieurs tours — garde-fous", () => {
  it("ordre chronologique des tours, même si l'ordre des libellés diffère", () => {
    // Tour 1 : « Group 7 » et « Group 8 » ; tour 2 : « Group 1 » et « Group 2 ».
    const standings = { "2026-2027": [
      { label: "Group 1", rows: [r("a", 1, 0, 0), r("d", 2, 0, 0), r("x", 3, 0, 0)] },
      { label: "Group 2", rows: [r("b", 1, 0, 0), r("e", 2, 0, 0), r("y", 3, 0, 0)] },
      { label: "Group 7", rows: [r("a", 1, 0, 0), r("b", 2, 0, 0), r("c", 3, 0, 0)] },
      { label: "Group 8", rows: [r("d", 1, 0, 0), r("e", 2, 0, 0), r("f", 3, 0, 0)] },
    ] };
    const groups = phaseGroups({ id: "c", name: "U17", ext: { standings_by_season: standings } }, "2026-2027", twoRounds(), {});
    expect(groups.map((g) => g.label)).toEqual(["Group 7", "Group 8", "Group 1", "Group 2"]);
  });
  it("match appartenant à deux groupes officiels : aucun rattachement officiel (ambigu)", () => {
    const standings = { "2026-2027": [...STANDINGS["2026-2027"].slice(0, 2), { label: "League A, Group 1", rows: [r("a", 1, 0, 0), r("b", 2, 0, 0), r("d", 3, 0, 0), r("x", 4, 0, 0)] }, STANDINGS["2026-2027"][3]] };
    const groups = phaseGroups({ id: "c", name: "U17", ext: { standings_by_season: standings } }, "2026-2027", twoRounds(), {});
    expect(groups.some((g) => g.official)).toBe(false);
  });
});
