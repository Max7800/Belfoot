import { beforeEach, describe, expect, it } from "vitest";
import { groupDisplayLabel, isRankingGroup, phaseGroups } from "@/lib/groupedStandings";
import { getCompetitionType, isKnockoutPhase } from "@/lib/competitionType";
import { loadSeasonMatches } from "@/lib/publicFootballData";
import { registerProvider } from "@/modules/football/providers";
import { syncCompetition } from "@/modules/football/syncCompetition";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Qualifications Euro U21 (ligue API 850) : plusieurs groupes dans une même
// phase « Group Stage », le groupe n'apparaît pas dans le match.
let seq = 0;
const game = (home, away, homeScore, awayScore, extra = {}) => ({
  id: `m${++seq}`, home_club_id: home, away_club_id: away, home_score: homeScore, away_score: awayScore,
  status: homeScore == null ? "scheduled" : "finished", kickoff: "2025-09-05T16:00:00Z", phase: "Group Stage", round_number: 1, ext: {}, ...extra,
});
const row = (club, rank, pts, playedCount, extra = {}) => ({ club, rank, pts, played: playedCount, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, ...extra });
const comp = (standingsBySeason) => ({ id: "c-850", external_id: "850", ext: { standings_by_season: standingsBySeason } });
const clubs = Object.fromEntries(["bel", "den", "fra", "ita", "cro", "eng", "esp", "ned", "por"].map((id) => [id, { id, name: id.toUpperCase() }]));
const teams = (groups) => groups.map((group) => group.rows.map((r) => r.club));

// Groupe A : bel, den, fra ; groupe B : ita, cro, eng. Aucun match entre groupes.
const groupStage = () => [
  game("bel", "den", 2, 0), game("fra", "bel", 1, 1), game("den", "fra", null, null),
  game("ita", "cro", 0, 1), game("eng", "ita", 2, 2), game("cro", "eng", null, null),
];
// Classements officiels dont les bilans correspondent exactement à groupStage().
// Groupe B : ita classée devant eng à points égaux (critère officiel), alors
// qu'un recalcul simple (différence de buts) mettrait eng devant.
const GROUP_A_EXACT = { label: "Group A", rows: [
  row("bel", 1, 4, 2, { won: 1, drawn: 1, gf: 3, ga: 1 }),
  row("fra", 2, 1, 1, { drawn: 1, gf: 1, ga: 1 }),
  row("den", 3, 0, 1, { lost: 1, gf: 0, ga: 2 }),
] };
const GROUP_B_EXACT = { label: "Group B", rows: [
  row("cro", 1, 3, 1, { won: 1, gf: 1, ga: 0 }),
  row("ita", 2, 1, 2, { drawn: 1, lost: 1, gf: 2, ga: 3 }),
  row("eng", 3, 1, 1, { drawn: 1, gf: 2, ga: 2 }),
] };

describe("phaseGroups — groupes officiels de la saison", () => {
  it("un tableau par groupe officiel, avec ses seules équipes, triés par libellé", () => {
    const stored = { "2025-2026": [
      { label: "Group B", rows: [row("cro", 1, 3, 1), row("eng", 2, 1, 1), row("ita", 3, 1, 2)] },
      { label: "Group A", rows: [row("bel", 1, 4, 2), row("fra", 2, 1, 1), row("den", 3, 0, 1)] },
    ] };
    const groups = phaseGroups(comp(stored), "2025-2026", groupStage(), clubs);
    expect(groups.map((g) => [g.kind, g.label, g.official])).toEqual([["group", "Group A", true], ["group", "Group B", true]]);
    expect(teams(groups)).toEqual([["bel", "fra", "den"], ["cro", "eng", "ita"]]);
  });

  it("classement officiel à jour : ordre officiel conservé (critères UEFA, confrontations directes)", () => {
    // ita devant eng à points égaux selon l'API (critère officiel) ; le recalcul
    // simple (différence de buts) les inverserait. Bilans identiques aux matchs.
    const stored = { "2025-2026": [GROUP_A_EXACT, GROUP_B_EXACT] };
    const [, groupB] = phaseGroups(comp(stored), "2025-2026", groupStage(), clubs);
    expect(groupB.source).toBe("official");
    expect(groupB.rows.map((r) => r.club)).toEqual(["cro", "ita", "eng"]);
  });

  it("classement officiel périmé (moins de matchs que la base) : points recalculés depuis les matchs", () => {
    const stored = { "2025-2026": [
      { label: "Group A", rows: [row("den", 1, 0, 0), row("bel", 2, 0, 0), row("fra", 3, 0, 0)] },
      { label: "Group B", rows: [row("ita", 1, 0, 0), row("cro", 2, 0, 0), row("eng", 3, 0, 0)] },
    ] };
    const [groupA] = phaseGroups(comp(stored), "2025-2026", groupStage(), clubs);
    expect(groupA.source).toBe("computed");
    expect(groupA.rows.map((r) => [r.club, r.pts, r.played])).toEqual([["bel", 4, 2], ["fra", 1, 1], ["den", 0, 1]]);
  });

  it("équipe officielle sans match joué : présente avec zéro point", () => {
    const stored = { "2025-2026": [
      { label: "Group A", rows: [row("bel", 1, 0, 0), row("den", 2, 0, 0), row("fra", 3, 0, 0), row("por", 4, 0, 0)] },
      { label: "Group B", rows: [row("ita", 1, 0, 0), row("cro", 2, 0, 0), row("eng", 3, 0, 0)] },
    ] };
    const [groupA] = phaseGroups(comp(stored), "2025-2026", groupStage(), clubs);
    expect(groupA.rows.find((r) => r.club === "por")).toMatchObject({ played: 0, pts: 0 });
  });

  it("classement officiel plus complet que la base (import partiel) : officiel conservé", () => {
    const stored = { "2025-2026": [
      { label: "Group A", rows: [row("fra", 1, 9, 4), row("bel", 2, 7, 4), row("den", 3, 0, 4)] },
      { label: "Group B", rows: [row("cro", 1, 9, 4), row("eng", 2, 4, 4), row("ita", 3, 2, 4)] },
    ] };
    const [groupA] = phaseGroups(comp(stored), "2025-2026", groupStage(), clubs);
    expect(groupA.rows.map((r) => [r.club, r.pts])).toEqual([["fra", 9], ["bel", 7], ["den", 0]]);
  });

  it("classement des deuxièmes : affiché tel que fourni, après les groupes", () => {
    const stored = { "2025-2026": [
      { label: "Group A", rows: [row("bel", 1, 4, 2), row("fra", 2, 1, 1), row("den", 3, 0, 1)] },
      { label: "Group B", rows: [row("cro", 1, 3, 1), row("eng", 2, 1, 1), row("ita", 3, 1, 2)] },
      { label: "Ranking of second-placed teams", rows: [row("eng", 2, 1, 1), row("fra", 1, 1, 1)] },
    ] };
    const groups = phaseGroups(comp(stored), "2025-2026", groupStage(), clubs);
    expect(groups.map((g) => g.kind)).toEqual(["group", "group", "ranking"]);
    expect(groups[2].rows.map((r) => r.club)).toEqual(["fra", "eng"]);
  });
});

describe("phaseGroups — absence de classement et prévention du mélange", () => {
  it("aucun classement pour la saison : groupes reconstitués depuis les matchs et signalés", () => {
    const groups = phaseGroups(comp({}), "2025-2026", groupStage(), clubs);
    expect(groups.map((g) => [g.label, g.official, g.source])).toEqual([["Groupe détecté 1", false, "computed"], ["Groupe détecté 2", false, "computed"]]);
    expect(groups.map((g) => g.teamIds.sort())).toEqual([["bel", "den", "fra"], ["cro", "eng", "ita"]]);
  });

  it("les groupes d'une AUTRE campagne ne sont jamais utilisés", () => {
    const other = { "2023-2024": [
      { label: "Group A", rows: [row("bel", 1, 18, 8), row("cro", 2, 15, 8), row("ita", 3, 3, 8)] },
      { label: "Group B", rows: [row("den", 1, 18, 8), row("eng", 2, 15, 8), row("fra", 3, 3, 8)] },
    ] };
    const groups = phaseGroups(comp(other), "2025-2026", groupStage(), clubs);
    expect(groups.every((g) => g.official === false)).toBe(true);
    expect(groups.map((g) => g.teamIds.sort())).toEqual([["bel", "den", "fra"], ["cro", "eng", "ita"]]);
  });

  it("sans saison : aucun groupe officiel lu", () => {
    const stored = { "": [{ label: "Group A", rows: [row("bel", 1, 0, 0), row("den", 2, 0, 0), row("fra", 3, 0, 0)] }, { label: "Group B", rows: [row("ita", 1, 0, 0), row("cro", 2, 0, 0), row("eng", 3, 0, 0)] }] };
    expect(phaseGroups(comp(stored), "", groupStage(), clubs).every((g) => g.official === false)).toBe(true);
  });

  it("groupes qui se chevauchent (ligue + play-offs, ex. Pro League) : tableau unique", () => {
    const league = [game("bel", "den", 1, 0), game("fra", "ita", 2, 1), game("bel", "fra", 0, 0), game("den", "ita", 1, 1)];
    const stored = { "2025-2026": [
      { label: "Jupiler Pro League", rows: [row("bel", 1, 4, 2), row("fra", 2, 4, 2), row("den", 3, 1, 2), row("ita", 4, 1, 2)] },
      { label: "Champions' Play-off", rows: [row("bel", 1, 0, 0), row("fra", 2, 0, 0)] },
    ] };
    expect(phaseGroups(comp(stored), "2025-2026", league, clubs)).toEqual([]);
  });

  it("match entre deux groupes officiels dans la phase : pas de découpage en groupes", () => {
    const stored = { "2025-2026": [
      { label: "Group A", rows: [row("bel", 1, 0, 0), row("den", 2, 0, 0), row("fra", 3, 0, 0)] },
      { label: "Group B", rows: [row("ita", 1, 0, 0), row("cro", 2, 0, 0), row("eng", 3, 0, 0)] },
    ] };
    expect(phaseGroups(comp(stored), "2025-2026", [...groupStage(), game("bel", "ita", 1, 0)], clubs)).toEqual([]);
  });

  it("phase d'un seul groupe (campagne « Group I - N ») : tableau unique", () => {
    const stored = { "2021-2022": [
      { label: "Group I", rows: [row("bel", 1, 0, 0), row("den", 2, 0, 0), row("fra", 3, 0, 0)] },
      { label: "Group B", rows: [row("ita", 1, 0, 0), row("cro", 2, 0, 0), row("eng", 3, 0, 0)] },
    ] };
    const phaseI = groupStage().slice(0, 3).map((m) => ({ ...m, phase: "Group I" }));
    expect(phaseGroups(comp(stored), "2021-2022", phaseI, clubs)).toEqual([]);
  });

  it("championnat ordinaire (une seule composante) : tableau unique", () => {
    const league = [game("bel", "den", 1, 0), game("den", "fra", 2, 1), game("fra", "ita", 0, 0)];
    expect(phaseGroups(comp({}), "2025-2026", league, clubs)).toEqual([]);
  });

  it("paires isolées (élimination mal nommée) : aucun « groupe » de deux équipes", () => {
    const pairs = [game("bel", "den", 1, 0), game("den", "bel", 0, 2), game("fra", "ita", 1, 1), game("ita", "fra", 0, 1)];
    expect(phaseGroups(comp({}), "2025-2026", pairs, clubs)).toEqual([]);
  });
});

describe("libellés et format", () => {
  it("libellés de groupe", () => {
    expect(groupDisplayLabel("Group A")).toBe("Groupe A");
    expect(groupDisplayLabel("Group 3")).toBe("Groupe 3");
    expect(groupDisplayLabel("Ranking of second-placed teams")).toBe("Classement des deuxièmes");
    expect(groupDisplayLabel("UEFA U21 Championship - Qualification")).toBe("UEFA U21 Championship - Qualification");
    expect(isRankingGroup("Group B")).toBe(false);
  });

  it("phase « Play-offs » : élimination directe ; mini-championnats « … Play-offs » non", () => {
    expect(isKnockoutPhase("Play-offs")).toBe(true);
    expect(isKnockoutPhase("Playoffs")).toBe(true);
    expect(isKnockoutPhase("Europe Play-offs")).toBe(false);
    expect(isKnockoutPhase("Conference League Play-offs")).toBe(false);
    expect(isKnockoutPhase("Group Stage")).toBe(false);
  });

  it("le type déduit d'une compétition non typée ne change pas avec « Play-offs »", () => {
    const phases = ["Regular Season", "Play-offs", "Final"].map((phase) => ({ phase }));
    expect(getCompetitionType({}, phases)).toBe("league");
  });
});

describe("loadSeasonMatches — aucune saison publiée, aucun mélange", () => {
  const matchesSeed = [
    { id: "m-2023", competition_id: "c-850", season_id: "s-2023", kickoff: "2023-09-01T16:00:00Z" },
    { id: "m-2025", competition_id: "c-850", season_id: "s-2025", kickoff: "2025-09-01T16:00:00Z" },
  ];
  it("saisons existantes non publiées : aucun match chargé", async () => {
    const db = createFakeSupabase({ seasons: [{ id: "s-2023", competition_id: "c-850", label: "2023-2024" }, { id: "s-2025", competition_id: "c-850", label: "2025-2026" }], matches: matchesSeed });
    expect(await loadSeasonMatches(db, "c-850", undefined)).toEqual([]);
  });

  it("saison choisie : uniquement ses matchs", async () => {
    const db = createFakeSupabase({ seasons: [{ id: "s-2023", competition_id: "c-850", label: "2023-2024" }], matches: matchesSeed });
    expect((await loadSeasonMatches(db, "c-850", "s-2025")).map((m) => m.id)).toEqual(["m-2025"]);
  });

  it("ancien import sans aucune saison : repli sur tous ses matchs", async () => {
    const db = createFakeSupabase({ seasons: [{ id: "s-other", competition_id: "c-other", label: "2025-2026" }], matches: [{ id: "m-legacy", competition_id: "c-850", season_id: null, kickoff: "2020-01-01T00:00:00Z" }] });
    expect((await loadSeasonMatches(db, "c-850", undefined)).map((m) => m.id)).toEqual(["m-legacy"]);
  });
});

describe("syncCompetition — une saison Belfoot par campagne", () => {
  const PROVIDER = "u21prov";
  const COMPETITION = { id: "c-850", name: "UEFA U21 Championship - Qualification", provider: PROVIDER, source: PROVIDER, external_id: "850", ext: {} };
  const fx = (id, home, away, kickoff, round = "Group Stage - 1") => ({ external_id: String(id), home_ext: home, away_ext: away, home_name: home, away_name: away, home_score: 1, away_score: 0, status: "finished", minute: 90, round, kickoff });
  const campaigns = {
    2023: [fx(1, "1", "2", "2023-09-08T16:00:00Z")],
    // Campagne 2025 : la phase finale se joue en 2027, la saison reste 2025-2026.
    2025: [fx(2, "1", "3", "2025-09-05T16:00:00Z"), fx(3, "3", "1", "2027-06-15T16:00:00Z", "Play-offs")],
  };
  const standings = {
    2023: [[{ team: { id: 1 }, rank: 1, points: 3, group: "Group A", all: { played: 1 } }, { team: { id: 2 }, rank: 2, points: 0, group: "Group A", all: { played: 1 } }]],
    2025: [[{ team: { id: 1 }, rank: 1, points: 3, group: "Group H", all: { played: 1 } }, { team: { id: 3 }, rank: 2, points: 0, group: "Group H", all: { played: 1 } }]],
  };
  beforeEach(() => registerProvider({
    key: PROVIDER,
    async fetchMatches(_competition, ctx) { return campaigns[String(ctx.season).slice(0, 4)] || []; },
    async fetchStandings(_competition, ctx) { return standings[String(ctx.season).slice(0, 4)] || []; },
  }));

  it("deux campagnes → deux saisons distinctes, sans fusion ni saison artificielle", async () => {
    // Match belge déjà importé à tort dans une saison artificielle 2024-2025.
    const db = createFakeSupabase({
      competitions: [{ ...COMPETITION }],
      seasons: [{ id: "s-artificial", competition_id: "c-850", label: "2024-2025" }],
      matches: [{ id: "m-belgian", source: PROVIDER, external_id: "1", competition_id: "c-850", season_id: "s-artificial", locked: false, ext: {} }],
    });
    await syncCompetition(db, { ...COMPETITION }, { season: "2023", mode: "full" });
    const afterFirst = db.rows("competitions")[0];
    await syncCompetition(db, { ...afterFirst }, { season: "2025", mode: "full" });

    const seasonOf = (externalId) => db.rows("seasons").find((s) => s.id === db.rows("matches").find((m) => m.external_id === externalId).season_id)?.label;
    expect(seasonOf("1")).toBe("2023-2024");
    expect(seasonOf("2")).toBe("2025-2026");
    expect(seasonOf("3")).toBe("2025-2026");
    expect(db.rows("seasons").map((s) => s.label).sort()).toEqual(["2023-2024", "2024-2025", "2025-2026"]);
    expect(db.rows("matches").filter((m) => m.season_id === "s-artificial")).toEqual([]);

    // Classements officiels rangés par campagne, sans écrasement.
    const stored = db.rows("competitions")[0].ext.standings_by_season;
    expect(Object.keys(stored).sort()).toEqual(["2023-2024", "2025-2026"]);
    expect(stored["2023-2024"][0].label).toBe("Group A");
    expect(stored["2025-2026"][0].label).toBe("Group H");
  });
});

describe("phaseGroups — un classement officiel unique pour la phase", () => {
  it("pas de reconstruction hasardeuse quand l'API fournit un seul tableau", () => {
    const stored = { "2025-2026": [{ label: "Group Stage", rows: ["bel", "den", "fra", "ita", "cro", "eng"].map((club, index) => row(club, index + 1, 0, 0)) }] };
    expect(phaseGroups(comp(stored), "2025-2026", groupStage(), clubs)).toEqual([]);
  });
});

describe("page compétition — câblage", () => {
  it("groupes par phase, saisons non publiées signalées", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync("app/competitions/[slug]/page.js", "utf8");
    expect(source).toMatch(/phaseGroups\(comp, seasonLabel, phaseMatches, clubsMap\)/);
    expect(source).toMatch(/!isNationsLeague && !phaseIsKnockout/);
    expect((source.match(/<GroupStandings groups=\{groupTables\}/g) || []).length).toBe(3);
    expect(source).toMatch(/const \{ seasons: orderedSeasons, unpublished \} = publicSeasonState\(se\.data \|\| \[\]\)/);
    expect(source).toMatch(/<SeasonNotice unpublished=\{unpublishedSeasons\} season=\{activeSeason\} matchCount=\{matches\.length\} loading=\{seasonLoading\} error=\{dataError\} \/>/);
    expect(source).toMatch(/useCompetitionMatchUpdates\(comp\?\.id, activeSeason\?\.id \|\| null, setMatches\)/);
  });
});
