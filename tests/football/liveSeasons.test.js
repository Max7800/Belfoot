import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeMatchUpdate } from "@/lib/matchUpdates";
import { phaseGroups } from "@/lib/groupedStandings";
import { computeStandings } from "@/lib/standings";
import { isMatchOver } from "@/lib/matchStatus";
import { isSeasonOver, nextMatchday } from "@/lib/matchdays";
import { publicSeasonState, seasonScopedMatches, sortPublicSeasons } from "@/lib/publicSeasons";
import { loadPublicSeasonState, loadSeasonMatches } from "@/lib/publicFootballData";
import { seasonNotice } from "@/lib/seasonNotice";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// ── Données : deux groupes de trois, saison 2027-2028 ────────────────────────
const SEASON = "2027-2028";
let seq = 0;
const game = (home, away, homeScore, awayScore, extra = {}) => ({
  id: `g${++seq}`, season_id: "s-2027", home_club_id: home, away_club_id: away, home_score: homeScore, away_score: awayScore,
  status: homeScore == null ? "scheduled" : "finished", kickoff: "2025-09-05T16:00:00Z", phase: "Group Stage", round_number: 1, ext: { status_short: homeScore == null ? "NS" : "FT", fixture_id: 1 }, ...extra,
});
const row = (club, rank, pts, played, extra = {}) => ({ club, rank, pts, played, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, ...extra });
const clubs = Object.fromEntries(["bel", "den", "fra", "ita", "cro", "eng"].map((id) => [id, { id, name: id.toUpperCase() }]));
const comp = (standings) => ({ id: "c-850", ext: { standings_by_season: standings } });
const groupOf = (groups, label) => groups.find((group) => group.label === label);
const table = (group) => group.rows.map((r) => [r.club, r.pts, r.played]);

function fixtures() {
  seq = 0;
  return [
    game("bel", "den", 2, 0), // g1
    game("fra", "bel", null, null, { status: "live", home_score: 0, away_score: 1, ext: { status_short: "2H" }, kickoff: new Date().toISOString() }), // g2 en direct
    game("den", "fra", null, null), // g3
    game("ita", "cro", 0, 1), game("eng", "ita", 2, 2), game("cro", "eng", null, null),
  ];
}
// Instantané officiel pris AVANT le direct : seul g1 joué dans le groupe A.
const officialBeforeLive = { [SEASON]: [
  { label: "Group A", rows: [row("bel", 1, 3, 1, { won: 1, gf: 2, ga: 0 }), row("fra", 2, 0, 0), row("den", 3, 0, 1, { lost: 1, ga: 2 })] },
  { label: "Group B", rows: [row("cro", 1, 3, 1, { won: 1, gf: 1 }), row("ita", 2, 1, 2, { drawn: 1, lost: 1, gf: 2, ga: 3 }), row("eng", 3, 1, 1, { drawn: 1, gf: 2, ga: 2 })] },
] };

describe("actualisation en direct — fusion des mises à jour Realtime", () => {
  it("live → finished : le match est remplacé et le classement par groupe recalculé", () => {
    let matches = fixtures();
    const before = groupOf(phaseGroups(comp(officialBeforeLive), SEASON, matches, clubs), "Group A");
    expect(before.source).toBe("official"); // le direct ne compte pas encore
    expect(table(before)).toEqual([["bel", 3, 1], ["fra", 0, 0], ["den", 0, 1]]);

    matches = mergeMatchUpdate(matches, { id: "g2", status: "finished", home_score: 0, away_score: 1, ext: { status_short: "FT" } }, "s-2027");
    const after = groupOf(phaseGroups(comp(officialBeforeLive), SEASON, matches, clubs), "Group A");
    expect(after.source).toBe("computed"); // l'instantané officiel est périmé
    expect(table(after)).toEqual([["bel", 6, 2], ["fra", 0, 1], ["den", 0, 1]]);
  });

  it("le classement classique est recalculé avec les mêmes données", () => {
    let matches = fixtures();
    const classic = () => computeStandings(matches.filter((m) => m.home_club_id && ["bel", "den", "fra"].includes(m.home_club_id)).filter((m) => isMatchOver(m)));
    expect(classic().find((r) => r.club === "bel").pts).toBe(3);
    matches = mergeMatchUpdate(matches, { id: "g2", status: "finished", ext: { status_short: "FT" } }, "s-2027");
    expect(classic().find((r) => r.club === "bel").pts).toBe(6);
  });

  it("score corrigé après la fin (même nombre de matchs) : l'officiel périmé n'est plus affiché", () => {
    let matches = fixtures();
    // Officiel à jour avec la victoire 2-0 de bel.
    expect(groupOf(phaseGroups(comp(officialBeforeLive), SEASON, matches, clubs), "Group A").source).toBe("official");
    matches = mergeMatchUpdate(matches, { id: "g1", home_score: 1, away_score: 1 }, "s-2027");
    const corrected = groupOf(phaseGroups(comp(officialBeforeLive), SEASON, matches, clubs), "Group A");
    expect(corrected.source).toBe("computed");
    expect(corrected.rows.find((r) => r.club === "bel")).toMatchObject({ pts: 1, drawn: 1, gf: 1, ga: 1 });
  });

  it("classement officiel à jour : reste prioritaire après une mise à jour sans résultat", () => {
    let matches = fixtures();
    matches = mergeMatchUpdate(matches, { id: "g3", kickoff: "2025-10-10T16:00:00Z" }, "s-2027");
    const groupB = groupOf(phaseGroups(comp(officialBeforeLive), SEASON, matches, clubs), "Group B");
    expect(groupB.source).toBe("official");
    expect(groupB.rows.map((r) => r.club)).toEqual(["cro", "ita", "eng"]); // ordre officiel, pas celui du recalcul
  });

  it("pénalité officielle (points différents, bilans identiques) : officiel conservé", () => {
    const sanctioned = { [SEASON]: [officialBeforeLive[SEASON][0], { label: "Group B", rows: officialBeforeLive[SEASON][1].rows.map((r) => r.club === "cro" ? { ...r, pts: 0 } : r) }] };
    const groupB = groupOf(phaseGroups(comp(sanctioned), SEASON, fixtures(), clubs), "Group B");
    expect(groupB.source).toBe("official");
    expect(groupB.rows.find((r) => r.club === "cro").pts).toBe(0);
  });

  it("champ absent de l'événement (valeur TOAST non renvoyée) : jamais effacé", () => {
    const merged = mergeMatchUpdate(fixtures(), { id: "g1", home_score: 3, ext: undefined }, "s-2027");
    expect(merged.find((m) => m.id === "g1")).toMatchObject({ home_score: 3, home_club_id: "bel", ext: { fixture_id: 1 } });
  });

  it("isolation des saisons : match d'une autre saison ignoré, match déplacé retiré", () => {
    const matches = fixtures();
    expect(mergeMatchUpdate(matches, { id: "g1", season_id: "s-2025", home_score: 9 }, "s-2027").map((m) => m.id)).not.toContain("g1");
    expect(mergeMatchUpdate(matches, { id: "autre", season_id: "s-2025", home_score: 9 }, "s-2027")).toBe(matches);
  });

  it("match inconnu ou ligne vide : liste inchangée (même référence, aucun rendu inutile)", () => {
    const matches = fixtures();
    expect(mergeMatchUpdate(matches, { id: "inconnu", home_score: 1 }, "s-2027")).toBe(matches);
    expect(mergeMatchUpdate(matches, null, "s-2027")).toBe(matches);
  });

  it("sans saison (ancien import) : mise à jour appliquée sans filtre", () => {
    const matches = fixtures().map((m) => ({ ...m, season_id: null }));
    expect(mergeMatchUpdate(matches, { id: "g3", home_score: 1, away_score: 0, status: "finished" }, null).find((m) => m.id === "g3").status).toBe("finished");
  });
});

describe("actualisation en direct — câblage des pages (même mécanisme partout)", () => {
  const read = (file) => fs.readFileSync(file, "utf8");
  it("page compétition, Classement et Matchs utilisent le même abonnement Realtime", () => {
    expect(read("app/competitions/[slug]/page.js")).toMatch(/useCompetitionMatchUpdates\(comp\?\.id, activeSeason\?\.id \|\| null, setMatches\)/);
    expect(read("app/classement/page.js")).toMatch(/useCompetitionMatchUpdates\(cid, activeSeason\?\.id \|\| null, setMatches\)/);
    expect(read("app/matchs/page.js")).toMatch(/useCompetitionMatchUpdates\(cid, activeSeason\?\.id \|\| null, setMatches\)/);
    const hook = read("lib/useCompetitionMatchUpdates.js");
    expect(hook).toMatch(/table: "matches", filter: `competition_id=eq\.\$\{competitionId\}`/);
    expect(hook).toMatch(/mergeMatchUpdate\(current, payload\.new, seasonId\)/);
    expect(hook).toMatch(/supabase\.removeChannel\(channel\)/);
  });

  it("Classement : erreur de chargement → plus de classement de la saison précédente", () => {
    expect(read("app/classement/page.js")).toMatch(/if \(alive\) \{ setMatches\(\[\]\); setClubs\(\{\}\); setLoading\(false\); setError/);
  });

  it("Classement et accueil : même règle de match joué et mêmes groupes que la page compétition", () => {
    const classement = read("app/classement/page.js");
    expect(classement).toMatch(/computeStandings\(phaseMatches\.filter\(\(m\) => isMatchOver\(m\)\)\)/);
    expect(classement).toMatch(/phaseGroups\(comp, activeSeason\?\.label, phaseMatches, clubs\)/);
    const home = read("app/page.js");
    expect(home).toMatch(/seasonScopedMatches\(competitionSeasons, /);
    expect(home).toMatch(/if \(!activeSeason && competitionSeasons\.length\) return Promise\.resolve\(\{ data: \[\] \}\)/);
    expect(home).toMatch(/phaseGroups\(competition, activeSeason\?\.label, displayMatches, data\.clubs\)/);
    expect(home).toMatch(/isMatchOver\(match, now\)/);
  });
});

// ── Saisons futures ──────────────────────────────────────────────────────────
const season = (id, label, extra = {}) => ({ id, competition_id: "c-850", label, import_status: "draft", public_active: false, ...extra });

describe("saisons publiques — pilotées par les données, sans année codée en dur", () => {
  it("brouillon invisible ; saison future publiée visible, même sans match", () => {
    const { seasons, unpublished } = publicSeasonState([season("s1", "2025-2026", { import_status: "active", public_active: true }), season("s2", "2027-2028", { import_status: "ready" }), season("s3", "2029-2030")]);
    expect(seasons.map((s) => s.label)).toEqual(["2025-2026", "2027-2028"]);
    expect(unpublished).toBe(false);
  });

  it("saison par défaut : la saison active publique, même si une saison future est publiée", () => {
    expect(sortPublicSeasons([season("s2", "2027-2028", { import_status: "ready" }), season("s1", "2025-2026", { import_status: "active", public_active: true })])[0].label).toBe("2025-2026");
  });

  it("sans saison active : la plus récente des saisons publiées (règle existante)", () => {
    expect(sortPublicSeasons([season("s1", "2025-2026", { import_status: "ready" }), season("s2", "2027-2028", { import_status: "ready" })])[0].label).toBe("2027-2028");
  });

  it("une année jamais vue (2031-2032) apparaît dès sa publication, sans modification du code", () => {
    const { seasons } = publicSeasonState([season("s1", "2029-2030", { import_status: "active", public_active: true }), season("s9", "2031-2032", { import_status: "ready" })]);
    expect(seasons.map((s) => s.label)).toContain("2031-2032");
  });

  it("des saisons, aucune publiée : signalé, et aucun match chargé", async () => {
    const rows = [season("s1", "2025-2026"), season("s2", "2027-2028", { import_status: "importing" })];
    expect(publicSeasonState(rows)).toEqual({ seasons: [], unpublished: true });
    const db = createFakeSupabase({ seasons: rows, matches: [{ id: "m1", competition_id: "c-850", season_id: "s1", kickoff: "2025-09-01T00:00:00Z" }] });
    expect(await loadPublicSeasonState(db, "c-850")).toEqual({ seasons: [], unpublished: true });
    expect(await loadSeasonMatches(db, "c-850", undefined)).toEqual([]);
  });

  it("aucune saison du tout (ancien import) : pas de message « non publiée »", () => {
    expect(publicSeasonState([])).toEqual({ seasons: [], unpublished: false });
  });

  it("sélection explicite d'une ancienne campagne : uniquement ses matchs", async () => {
    const db = createFakeSupabase({
      seasons: [season("s-2023", "2023-2024", { import_status: "ready" }), season("s-2027", "2027-2028", { import_status: "active", public_active: true })],
      matches: [
        { id: "old", competition_id: "c-850", season_id: "s-2023", kickoff: "2021-09-01T00:00:00Z" },
        { id: "new", competition_id: "c-850", season_id: "s-2027", kickoff: "2025-09-01T00:00:00Z" },
      ],
    });
    expect((await loadSeasonMatches(db, "c-850", "s-2023")).map((m) => m.id)).toEqual(["old"]);
    expect((await loadSeasonMatches(db, "c-850", "s-2027")).map((m) => m.id)).toEqual(["new"]);
  });
});

describe("saison future publiée — affichage", () => {
  const future = season("s9", "2031-2032", { import_status: "ready" });
  it("zéro match : état explicite « Saison … à venir »", () => {
    expect(seasonNotice({ season: future, matchCount: 0 })).toMatchObject({ kind: "empty", title: "Saison 2031-2032 à venir." });
  });
  it("premiers matchs : plus de message", () => {
    expect(seasonNotice({ season: future, matchCount: 3 })).toBeNull();
  });
  it("aucune saison publiée : message dédié ; chargement ou erreur : aucun message trompeur", () => {
    expect(seasonNotice({ unpublished: true })).toMatchObject({ kind: "unpublished" });
    expect(seasonNotice({ season: future, matchCount: 0, loading: true })).toBeNull();
    expect(seasonNotice({ season: future, matchCount: 0, error: "réseau" })).toBeNull();
  });
  it("zéro match ne casse ni les groupes, ni la prochaine journée, ni la fin de saison", () => {
    expect(phaseGroups(comp({ "2031-2032": officialBeforeLive[SEASON] }), "2031-2032", [], clubs)).toEqual([]);
    expect(nextMatchday([], Date.now())).toBeNull();
    expect(isSeasonOver([], Date.now())).toBe(false);
  });
  it("premiers matchs d'une nouvelle campagne : groupes de CETTE saison uniquement", () => {
    const first = [game("bel", "den", null, null, { season_id: "s9" }), game("fra", "bel", null, null, { season_id: "s9" }), game("ita", "cro", null, null, { season_id: "s9" }), game("eng", "ita", null, null, { season_id: "s9" }), game("cro", "eng", null, null, { season_id: "s9" }), game("den", "fra", null, null, { season_id: "s9" })];
    // Classement de la campagne précédente stocké, mais pas encore de celle-ci.
    const groups = phaseGroups(comp(officialBeforeLive), "2031-2032", first, clubs);
    expect(groups.every((g) => g.official === false)).toBe(true);
    expect(groups.every((g) => g.rows.every((r) => r.played === 0))).toBe(true);
  });
});

describe("accueil — matchs limités à la saison affichée", () => {
  const matches = [{ id: "a", season_id: "s1" }, { id: "b", season_id: "s2" }];
  it("saison publique : ses matchs seulement", () => {
    expect(seasonScopedMatches([season("s1", "2025-2026")], matches, "s1").map((m) => m.id)).toEqual(["a"]);
  });
  it("saisons existantes, aucune publiée : aucun match (jamais de mélange)", () => {
    expect(seasonScopedMatches([season("s1", "2025-2026"), season("s2", "2027-2028")], matches, null)).toEqual([]);
  });
  it("ancien import sans saison : tous ses matchs", () => {
    expect(seasonScopedMatches([], [{ id: "x", season_id: null }], null).map((m) => m.id)).toEqual(["x"]);
  });
  it("saison publique mais matchs historiques sans saison : repli historique conservé", () => {
    expect(seasonScopedMatches([season("s1", "2025-2026")], [{ id: "x", season_id: null }], "s1").map((m) => m.id)).toEqual(["x"]);
  });
});

describe("JSX des pages modifiées — aucun code rendu comme du texte", () => {
  // Régression constatée : `<PhaseChips />(groupTables.length ? … : …)` sans
  // accolades est du JSX valide qui affiche « ( », « : » et les DEUX tableaux.
  it("aucun texte JSX ne contient d'expression de classement", async () => {
    const { createRequire } = await import("node:module");
    const espree = createRequire(import.meta.url)("espree");
    const texts = [];
    const walk = (node) => {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "JSXText" && node.value.trim()) texts.push(node.value.trim());
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === "object" && value.type) walk(value);
      }
    };
    for (const file of ["app/competitions/[slug]/page.js", "app/classement/page.js", "app/matchs/page.js", "app/page.js", "components/football/GroupStandings.js", "components/football/SeasonNotice.js"]) {
      walk(espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } }));
    }
    const leaked = texts.filter((text) => /groupTables|groups\.length|standings|\.length \?|^\($|^\)$|^:$/.test(text));
    expect(leaked).toEqual([]);
  });
});
