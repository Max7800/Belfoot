import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { MERGED_GROUP_PHASE, mergeGroupStagePhases, phaseGroups } from "@/lib/groupedStandings";
import { isKnockoutPhase } from "@/lib/competitionType";
import { mergeMatchUpdate } from "@/lib/matchUpdates";

// Forme réelle de la campagne U21 2023 (ligue 850, saison API 2023) : les matchs
// de groupe sont rangés sous « Group A »…« Group I » ET, pour une partie, sous
// « Ranking of second-placed teams » ; les barrages sous « Play-offs ».
let seq = 0;
const game = (phase, home, away, homeScore = 1, awayScore = 0, extra = {}) => ({
  id: `m${++seq}`, season_id: "s-2023", phase, round_raw: `${phase} - ${seq}`, round_number: seq, home_club_id: home, away_club_id: away,
  home_score: homeScore, away_score: awayScore, status: homeScore == null ? "scheduled" : "finished", kickoff: "2021-09-01T16:00:00Z", ext: {}, ...extra,
});
const row = (club, rank, pts, played, extra = {}) => ({ club, rank, pts, played, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, ...extra });
const U21 = (standings) => ({ id: "c-850", name: "UEFA U21 Championship - Qualification", ext: { standings_by_season: standings } });
const KO = { isKnockout: isKnockoutPhase };
const phasesOf = (matches) => [...new Set(matches.map((m) => m.phase))].sort();

// Groupe A : bel, den, fra ; groupe B : ita, cro, eng. Bilans officiels exacts.
const OFFICIAL_2023 = { "2023-2024": [
  { label: "Group A", rows: [row("bel", 1, 6, 2, { won: 2, gf: 3, ga: 0 }), row("fra", 2, 3, 2, { won: 1, lost: 1, gf: 1, ga: 1 }), row("den", 3, 0, 2, { lost: 2, gf: 0, ga: 3 })] },
  { label: "Group B", rows: [row("cro", 1, 4, 2, { won: 1, drawn: 1, gf: 2, ga: 1 }), row("ita", 2, 2, 2, { drawn: 2, gf: 2, ga: 2 }), row("eng", 3, 1, 2, { drawn: 1, lost: 1, gf: 1, ga: 2 })] },
  { label: "Ranking of second-placed teams", rows: [row("fra", 1, 3, 2), row("ita", 2, 2, 2)] },
] };
const campaign2023 = () => {
  seq = 0;
  return [
    game("Group A", "bel", "den", 2, 0), game("Group A", "fra", "den", 1, 0),
    game("Ranking of second-placed teams", "bel", "fra", 1, 0), // match du groupe A rangé ailleurs par l'API
    game("Group B", "cro", "eng", 1, 0), game("Group B", "ita", "eng", 1, 1),
    game("Ranking of second-placed teams", "ita", "cro", 1, 1), // match du groupe B rangé ailleurs
    game("Play-offs", "fra", "ita", 2, 1), // barrage entre deux groupes
  ];
};

describe("mergeGroupStagePhases — campagne U21 2023", () => {
  it("les phases de groupe éclatées deviennent une seule phase ; les barrages restent à part", () => {
    const merged = mergeGroupStagePhases(U21(OFFICIAL_2023), "2023-2024", campaign2023(), KO);
    expect(phasesOf(merged)).toEqual([MERGED_GROUP_PHASE, "Play-offs"]);
    expect(merged.filter((m) => m.phase === MERGED_GROUP_PHASE)).toHaveLength(6);
  });

  it("le classement par groupe utilise TOUS les matchs du groupe (plus de classement amputé)", () => {
    const merged = mergeGroupStagePhases(U21(OFFICIAL_2023), "2023-2024", campaign2023(), KO);
    const groups = phaseGroups(U21(OFFICIAL_2023), "2023-2024", merged.filter((m) => m.phase === MERGED_GROUP_PHASE), {});
    expect(groups.filter((g) => g.kind === "group").map((g) => [g.label, g.source, g.rows.map((r) => [r.club, r.pts, r.played])])).toEqual([
      ["Group A", "official", [["bel", 6, 2], ["fra", 3, 2], ["den", 0, 2]]],
      ["Group B", "official", [["cro", 4, 2], ["ita", 2, 2], ["eng", 1, 2]]],
    ]);
    expect(groups.at(-1)).toMatchObject({ kind: "ranking" });
  });

  it("sans regroupement, la phase « Group A » seule donnait un classement amputé (régression évitée)", () => {
    const groupA = campaign2023().filter((m) => m.phase === "Group A");
    expect(phaseGroups(U21(OFFICIAL_2023), "2023-2024", groupA, {})).toEqual([]); // tableau unique de 2 matchs sur 3
  });

  it("libellé de tour conservé, données d'origine jamais modifiées", () => {
    const input = campaign2023();
    const before = JSON.stringify(input);
    const merged = mergeGroupStagePhases(U21(OFFICIAL_2023), "2023-2024", input, KO);
    expect(JSON.stringify(input)).toBe(before);
    expect(merged[2]).toMatchObject({ phase: MERGED_GROUP_PHASE, round_raw: "Ranking of second-placed teams - 3" });
  });

  it("mise à jour en direct (phase d'origine renvoyée par la base) : toujours regroupée", () => {
    const state = mergeMatchUpdate(campaign2023(), { id: "m3", phase: "Ranking of second-placed teams", home_score: 0, away_score: 0 }, "s-2023");
    const merged = mergeGroupStagePhases(U21(OFFICIAL_2023), "2023-2024", state, KO);
    expect(merged.find((m) => m.id === "m3")).toMatchObject({ phase: MERGED_GROUP_PHASE, home_score: 0 });
  });
});

describe("mergeGroupStagePhases — rien n'est regroupé hors de ce cas", () => {
  it("campagne au format standard (une seule « Group Stage ») : inchangée, même référence", () => {
    const standard = campaign2023().map((m) => m.phase === "Play-offs" ? m : { ...m, phase: "Group Stage" });
    expect(mergeGroupStagePhases(U21(OFFICIAL_2023), "2023-2024", standard, KO)).toBe(standard);
  });

  it("classement d'une autre saison, ou aucune saison : inchangé", () => {
    const matches = campaign2023();
    expect(mergeGroupStagePhases(U21(OFFICIAL_2023), "2025-2026", matches, KO)).toBe(matches);
    expect(mergeGroupStagePhases(U21(OFFICIAL_2023), "", matches, KO)).toBe(matches);
    expect(mergeGroupStagePhases(U21({}), "2023-2024", matches, KO)).toBe(matches);
  });

  it("groupes qui se chevauchent (Pro League : saison régulière + play-offs) : inchangé", () => {
    seq = 0;
    const pro = [game("Regular Season", "bel", "den"), game("Regular Season", "fra", "ita"), game("Championship Round", "bel", "fra")];
    const standings = { "2025-2026": [
      { label: "Jupiler Pro League", rows: [row("bel", 1, 0, 0), row("den", 2, 0, 0), row("fra", 3, 0, 0), row("ita", 4, 0, 0)] },
      { label: "Champions' Play-off", rows: [row("bel", 1, 0, 0), row("fra", 2, 0, 0)] },
    ] };
    expect(mergeGroupStagePhases({ id: "c-144", name: "Pro League", ext: { standings_by_season: standings } }, "2025-2026", pro, KO)).toBe(pro);
  });

  it("Ligue des nations : jamais regroupée (logique de divisions propre)", () => {
    seq = 0;
    const nl = [game("League A", "bel", "den"), game("League B", "ita", "cro")];
    const standings = { "2024-2025": [{ label: "League A - Group 1", rows: [row("bel", 1, 0, 0), row("den", 2, 0, 0)] }, { label: "League B - Group 1", rows: [row("ita", 1, 0, 0), row("cro", 2, 0, 0)] }] };
    expect(mergeGroupStagePhases({ id: "c-5", external_id: "5", name: "UEFA Nations League", ext: { standings_by_season: standings } }, "2024-2025", nl, KO)).toBe(nl);
  });

  it("une phase contenant un match entre deux groupes n'est pas regroupée", () => {
    const matches = [...campaign2023(), game("Group A", "bel", "ita")]; // « Group A » n'est plus intra-groupe
    const merged = mergeGroupStagePhases(U21(OFFICIAL_2023), "2023-2024", matches, KO);
    expect(phasesOf(merged)).toEqual(["Group A", MERGED_GROUP_PHASE, "Play-offs"]);
  });

  it("une seule phase concernée : inchangé", () => {
    const matches = campaign2023().filter((m) => m.phase !== "Group B" && m.phase !== "Ranking of second-placed teams");
    expect(mergeGroupStagePhases(U21(OFFICIAL_2023), "2023-2024", matches, KO)).toBe(matches);
  });

  it("phase à élimination directe jamais absorbée, même entre équipes d'un même groupe", () => {
    seq = 10;
    const matches = [...campaign2023(), game("Final", "bel", "den")];
    expect(mergeGroupStagePhases(U21(OFFICIAL_2023), "2023-2024", matches, KO).find((m) => m.phase === "Final")).toBeTruthy();
  });

  it("un seul groupe officiel : inchangé", () => {
    const matches = campaign2023();
    expect(mergeGroupStagePhases(U21({ "2023-2024": [OFFICIAL_2023["2023-2024"][0]] }), "2023-2024", matches, KO)).toBe(matches);
  });
});

describe("pages — câblage (dérivé mémoïsé, jamais dans l'état)", () => {
  const read = (file) => fs.readFileSync(file, "utf8");
  it("page compétition, Classement et accueil appliquent le regroupement", () => {
    expect(read("app/competitions/[slug]/page.js")).toContain("const seasonMatches = useMemo(() => mergeGroupStagePhases(comp, seasonLabel, matches, { isKnockout: isKnockoutPhase }), [comp, seasonLabel, matches]);");
    expect(read("app/classement/page.js")).toContain("const seasonMatches = useMemo(() => mergeGroupStagePhases(comp, activeSeason?.label, matches, { isKnockout: isKnockoutPhase }), [comp, activeSeason?.label, matches]);");
    expect(read("app/page.js")).toContain("mergeGroupStagePhases(competition, activeSeason?.label, seasonScopedMatches(");
  });
});

describe("classement officiel daté — résultats annulés, matchs postérieurs", () => {
  // Groupe C U21 2023 : la Russie exclue, ses résultats annulés par l'UEFA, mais
  // encore « terminés » en base. Instantané pris après la fin de la campagne.
  const SNAPSHOT = "2026-10-16T14:13:07.192Z";
  const withSnapshot = (standings, snapshot = SNAPSHOT) => ({ id: "c-850", name: "UEFA U21", ext: { standings_by_season: standings, full_competition_seasons: { "2023-2024": snapshot } } });
  const officialC = { "2023-2024": [
    { label: "Group C", rows: [row("esp", 1, 3, 1, { won: 1, gf: 2, ga: 0 }), row("svk", 2, 0, 1, { lost: 1, gf: 0, ga: 2 }), row("rus", 3, 0, 0)] },
    { label: "Group D", rows: [row("ita", 1, 3, 1, { won: 1, gf: 1 }), row("cro", 2, 0, 1, { lost: 1, ga: 1 }), row("eng", 3, 0, 0)] },
  ] };
  const matchesC = () => {
    seq = 0;
    return [
      game("Group Stage", "esp", "svk", 2, 0, { kickoff: "2021-09-02T16:00:00Z" }),
      game("Group Stage", "rus", "esp", 3, 0, { kickoff: "2021-10-08T16:00:00Z" }), // annulé par l'UEFA, « terminé » en base
      game("Group Stage", "svk", "rus", 0, 1, { kickoff: "2021-11-12T16:00:00Z" }), // idem
      game("Group Stage", "ita", "cro", 1, 0, { kickoff: "2021-09-02T16:00:00Z" }),
      game("Group Stage", "eng", "ita", null, null, { kickoff: "2027-03-20T16:00:00Z" }),
    ];
  };
  const groupC = (comp, matches) => phaseGroups(comp, "2023-2024", matches, {}).find((g) => g.label === "Group C");

  it("instantané postérieur aux matchs : l'officiel fait foi (résultats annulés respectés)", () => {
    const c = groupC(withSnapshot(officialC), matchesC());
    expect(c.source).toBe("official");
    expect(c.rows.map((r) => [r.club, r.played, r.pts])).toEqual([["esp", 1, 3], ["svk", 1, 0], ["rus", 0, 0]]);
  });

  it("sans date d'instantané : repli sur la comparaison équipe par équipe (recalcul)", () => {
    const comp = { id: "c-850", name: "UEFA U21", ext: { standings_by_season: officialC } };
    expect(groupC(comp, matchesC()).source).toBe("computed");
  });

  it("match terminé APRÈS l'instantané : classement recalculé", () => {
    const later = [...matchesC(), game("Group Stage", "svk", "esp", 1, 0, { kickoff: "2026-10-20T16:00:00Z" })];
    const c = groupC(withSnapshot(officialC), later);
    expect(c.source).toBe("computed");
  });

  it("match en cours au moment de l'instantané (commencé < 3 h avant), terminé depuis : recalculé", () => {
    const inProgress = [...matchesC(), game("Group Stage", "svk", "esp", 1, 0, { kickoff: "2026-10-16T12:30:00Z" })];
    expect(groupC(withSnapshot(officialC), inProgress).source).toBe("computed");
  });

  it("match commencé plus de 3 h avant l'instantané : l'officiel l'inclut, il fait foi", () => {
    const before = [...matchesC(), game("Group Stage", "svk", "esp", 1, 0, { kickoff: "2026-10-16T10:00:00Z" })];
    expect(groupC(withSnapshot(officialC), before).source).toBe("official");
  });

  it("match à venir après l'instantané : l'officiel reste valable", () => {
    const d = phaseGroups(withSnapshot(officialC), "2023-2024", matchesC(), {}).find((g) => g.label === "Group D");
    expect(d.source).toBe("official");
  });

  it("date d'instantané illisible : repli équipe par équipe", () => {
    expect(groupC(withSnapshot(officialC, "pas une date"), matchesC()).source).toBe("computed");
  });
});

describe("groupes officiels contredits par les matchs (API U21 saison 2025)", () => {
  // L'API a renvoyé pour la saison 2025 les groupes de la campagne 2023 :
  // aucune répartition des matchs ne correspond aux groupes stockés.
  const wrong = { "2025-2026": [
    { label: "Group A", rows: [row("bel", 1, 0, 0), row("ita", 2, 0, 0), row("den", 3, 0, 0)] },
    { label: "Group B", rows: [row("fra", 1, 0, 0), row("cro", 2, 0, 0), row("eng", 3, 0, 0)] },
    { label: "Ranking of second-placed teams", rows: [row("ita", 1, 0, 0), row("cro", 2, 0, 0)] },
  ] };
  const real = () => {
    seq = 0; // vrais groupes : bel-den-fra et ita-cro-eng
    return [game("Group Stage", "bel", "den"), game("Group Stage", "den", "fra"), game("Group Stage", "fra", "bel"),
      game("Group Stage", "ita", "cro"), game("Group Stage", "cro", "eng"), game("Group Stage", "eng", "ita")];
  };
  const comp = { id: "c-850", name: "UEFA U21", ext: { standings_by_season: wrong, full_competition_seasons: { "2025-2026": "2026-10-16T14:15:31.079Z" } } };

  it("groupes reconstitués depuis les matchs, signalés, sans le classement annexe faux", () => {
    const groups = phaseGroups(comp, "2025-2026", real(), {});
    expect(groups.map((g) => [g.kind, g.official, g.teamIds.sort()])).toEqual([["group", false, ["bel", "den", "fra"]], ["group", false, ["cro", "eng", "ita"]]]);
  });

  it("aucune équipe d'un groupe faux n'est mélangée à un autre groupe", () => {
    const groups = phaseGroups(comp, "2025-2026", real(), {});
    for (const g of groups) expect(g.rows.map((r) => r.club).sort()).toEqual(g.teamIds.sort());
  });
});

describe("garde-fous supplémentaires du regroupement et de l'instantané", () => {
  it("groupes officiels qui se chevauchent : jamais de regroupement, même si chaque phase reste dans un groupe", () => {
    seq = 0;
    const matches = [game("Regular Season", "fra", "ita"), game("Championship Round", "bel", "den")];
    const standings = { "2025-2026": [
      { label: "League", rows: [row("bel", 1, 0, 0), row("den", 2, 0, 0), row("fra", 3, 0, 0), row("ita", 4, 0, 0)] },
      { label: "Play-off group", rows: [row("bel", 1, 0, 0), row("den", 2, 0, 0)] },
    ] };
    expect(mergeGroupStagePhases({ id: "x", name: "Ligue", ext: { standings_by_season: standings } }, "2025-2026", matches, KO)).toBe(matches);
  });

  it("un seul groupe officiel : deux phases internes ne sont pas fusionnées (ligue + play-offs)", () => {
    seq = 0;
    const matches = [game("Regular Season", "bel", "den"), game("Championship Round", "bel", "fra")];
    const standings = { "2025-2026": [{ label: "League", rows: [row("bel", 1, 0, 0), row("den", 2, 0, 0), row("fra", 3, 0, 0)] }] };
    expect(mergeGroupStagePhases({ id: "x", name: "Ligue", ext: { standings_by_season: standings } }, "2025-2026", matches, KO)).toBe(matches);
  });

  it("instantané daté pour une autre saison seulement : repli équipe par équipe pour celle-ci", () => {
    seq = 0;
    const standings = { "2023-2024": [
      { label: "Group C", rows: [row("esp", 1, 3, 1, { won: 1, gf: 2 }), row("svk", 2, 0, 1, { lost: 1, ga: 2 }), row("rus", 3, 0, 0)] },
      { label: "Group D", rows: [row("ita", 1, 0, 0), row("cro", 2, 0, 0), row("eng", 3, 0, 0)] },
    ] };
    const comp = { id: "c", name: "U21", ext: { standings_by_season: standings, full_competition_seasons: { "2025-2026": "2026-10-16T14:15:31.079Z" } } };
    const matches = [game("Group Stage", "esp", "svk", 2, 0), game("Group Stage", "rus", "esp", 3, 0), game("Group Stage", "ita", "cro", null, null), game("Group Stage", "cro", "eng", null, null)];
    expect(phaseGroups(comp, "2023-2024", matches, {}).find((g) => g.label === "Group C").source).toBe("computed");
  });
});
