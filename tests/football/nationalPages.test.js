import fs from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { categoryLabel, isDisplayedNationalTeam, isSeniorMenTeam, pickNationalTabs, sortNationalTeams, teamCategory, teamGender } from "@/lib/nationalCategories";
import { selectionGroupStanding } from "@/lib/selectionGroup";
import { isKnockoutPhase } from "@/lib/competitionType";

// Inventaire réel des sélections belges (lecture publique du 18/10/2026).
const team = (id, name, extra = {}) => ({ id, name, national_category: null, national_gender: null, national_followed: false, ...extra });
const BELGIUM = [
  team("bel-manual", "Belgique", { national_category: "senior", national_gender: "men" }),
  team("bel", "Belgium", { national_category: "senior", national_gender: "men", national_followed: true }),
  team("u21", "Belgium U21", { national_category: "u21", national_gender: "men", national_followed: true }),
  team("u19", "Belgium U19"), team("u18", "Belgium U18"), team("u17", "Belgium U17"),
  team("w", "Belgium W", { national_category: "women", national_gender: "women", national_followed: true }),
  team("u23w", "Belgium U23 W"), team("u19w", "Belgium U19 W"), team("u17w", "Belgium U17 W"), team("u16w", "Belgium U16 W"),
];
const ACTIVITY = new Map([["bel", 30], ["u21", 40], ["w", 4], ["u17w", 1], ["u16w", 3]]);
const tabs = () => pickNationalTabs(BELGIUM, ACTIVITY).map((t) => `${t.national_gender}:${categoryLabel(t)}=${t.name}`);

describe("catégories des sélections — genre et âge distincts", () => {
  it("le suffixe « W » fait une sélection féminine, même sans genre stocké", () => {
    expect(teamGender(team("x", "Belgium U23 W"))).toBe("women");
    expect(teamGender(team("x", "Belgium Women"))).toBe("women");
    expect(teamGender(team("x", "Belgium U19"))).toBe("men");
    expect(teamGender(team("x", "Belgium", { national_gender: "women" }))).toBe("women");
  });
  it("catégorie historique « women » = équipe A féminine", () => {
    const flames = BELGIUM.find((t) => t.id === "w");
    expect([teamCategory(flames), teamGender(flames), categoryLabel(flames)]).toEqual(["senior", "women", "Red Flames"]);
  });
  it("âge lu dans le nom ; une catégorie inconnue n'est jamais rangée en « A »", () => {
    expect(teamCategory(team("x", "Belgium U19"))).toBe("u19");
    expect(teamCategory(team("x", "Belgium U16 W"))).toBe("u16");
    expect(teamCategory(team("x", "Belgium U14"))).toBeNull();
    expect(teamCategory(team("x", "Belgium", { national_category: "inconnue" }))).toBeNull();
    expect(teamCategory(team("x", "Belgium"))).toBe("senior");
  });
  it("équipe A masculine reconnue seule", () => {
    expect(BELGIUM.filter(isSeniorMenTeam).map((t) => t.id)).toEqual(["bel-manual", "bel"]);
  });
});

describe("onglets de la page Diables — données réelles", () => {
  it("plus de faux « U23 » ni de « U17 » féminine chez les hommes ; féminines de jeunes masquées", () => {
    expect(tabs()).toEqual([
      "men:Diables Rouges=Belgium",
      "men:Espoirs U21=Belgium U21",
      "men:U19=Belgium U19",
      "men:U17=Belgium U17",
      "men:U18=Belgium U18",
      "women:Red Flames=Belgium W",
    ]);
  });
  it("les féminines de jeunes ne sont pas supprimées : elles sont seulement non affichées", () => {
    const hidden = BELGIUM.filter((t) => !isDisplayedNationalTeam(t)).map((t) => t.name);
    expect(hidden).toEqual(["Belgium U23 W", "Belgium U19 W", "Belgium U17 W", "Belgium U16 W"]);
    expect(BELGIUM).toHaveLength(11); // l'entrée n'est jamais modifiée
  });
  it("équipe A : la plus active l'emporte sur le doublon manuel sans match", () => {
    expect(pickNationalTabs(BELGIUM, ACTIVITY).find((t) => t.national_category === "senior" && t.national_gender === "men").id).toBe("bel");
  });
  it("annuaire : même règle (ordre et masquage)", () => {
    const followed = BELGIUM.filter((t) => t.national_followed || t.id === "u17w");
    expect(sortNationalTeams(followed).map((t) => t.name)).toEqual(["Belgium", "Belgium U21", "Belgium W"]);
  });
});

// ── Groupe de la sélection : même règle que la page compétition ──────────────
let seq = 0;
const game = (phase, home, away, homeScore, awayScore, kickoff = "2025-10-10T16:00:00Z") => ({ id: `m${++seq}`, phase, home_club_id: home, away_club_id: away, home_score: homeScore, away_score: awayScore, status: homeScore == null ? "scheduled" : "finished", kickoff, ext: {} });
const row = (club, rank, pts, played, extra = {}) => ({ club, rank, pts, played, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, ...extra });
const STANDINGS = { "2027-2028": [
  { label: "Group I", rows: [row("bel", 1, 3, 1, { won: 1, gf: 2, ga: 0 }), row("den", 2, 0, 1, { lost: 1, ga: 2 }), row("aut", 3, 0, 0)] },
  { label: "Group A", rows: [row("esp", 1, 3, 1, { won: 1, gf: 1 }), row("ita", 2, 0, 1, { lost: 1, ga: 1 }), row("fra", 3, 0, 0)] },
  { label: "Ranking of second-placed teams", rows: [row("den", 1, 0, 1)] },
] };
const U21 = { id: "c-850", name: "UEFA U21", ext: { standings_by_season: STANDINGS, full_competition_seasons: { "2027-2028": "2026-10-16T14:17:36.761Z" } } };
const season2027 = () => { seq = 0; return [game("Group Stage", "bel", "den", 2, 0), game("Group Stage", "esp", "ita", 1, 0), game("Group Stage", "aut", "bel", null, null, "2026-11-01T16:00:00Z"), game("Play-offs", "bel", "esp", null, null, "2026-11-12T16:00:00Z")]; };

describe("groupe de la sélection (page Diables)", () => {
  it("groupe officiel de la bonne saison, avec la sélection", () => {
    const g = selectionGroupStanding({ competition: U21, seasonLabel: "2027-2028", matches: season2027(), teamId: "bel", isKnockout: isKnockoutPhase });
    expect(g).toMatchObject({ label: "Group I", source: "official" });
    expect(g.rows.map((r) => [r.club, r.pts, r.gd])).toEqual([["bel", 3, 2], ["den", 0, -2], ["aut", 0, 0]]);
  });
  it("jamais le classement d'une autre saison", () => {
    expect(selectionGroupStanding({ competition: U21, seasonLabel: "2025-2026", matches: season2027(), teamId: "bel", isKnockout: isKnockoutPhase })).toBeNull();
  });
  it("saison inconnue : aucun classement emprunté à une autre saison", () => {
    for (const seasonLabel of ["", null, undefined]) expect(selectionGroupStanding({ competition: U21, seasonLabel, matches: season2027(), teamId: "bel", isKnockout: isKnockoutPhase })).toBeNull();
  });
  it("barrages ignorés : la phase de groupes reste la référence", () => {
    expect(selectionGroupStanding({ competition: U21, seasonLabel: "2027-2028", matches: season2027(), teamId: "bel", isKnockout: isKnockoutPhase }).label).toBe("Group I");
  });
  it("compétition sans classement stocké (amicaux) ou sélection absente : null (calcul historique)", () => {
    expect(selectionGroupStanding({ competition: { id: "f", ext: {} }, seasonLabel: "2027-2028", matches: season2027(), teamId: "bel", isKnockout: isKnockoutPhase })).toBeNull();
    expect(selectionGroupStanding({ competition: U21, seasonLabel: "2027-2028", matches: season2027(), teamId: "inconnue", isKnockout: isKnockoutPhase })).toBeNull();
    expect(selectionGroupStanding({ competition: U21, seasonLabel: "2027-2028", matches: [], teamId: "bel" })).toBeNull();
  });
});

// ── Page Diables : structure du JSX réel ────────────────────────────────────
const espree = createRequire(import.meta.url)("espree");
const source = fs.readFileSync("app/diables-rouges/page.js", "utf8");
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", range: true, ecmaFeatures: { jsx: true } });
const asideOf = () => {
  let aside = null;
  const walk = (n) => { if (!n || typeof n.type !== "string") return; if (n.type === "JSXElement" && n.openingElement.name.name === "aside") aside = n; for (const v of Object.values(n)) (Array.isArray(v) ? v : [v]).forEach((c) => c && typeof c === "object" && typeof c.type === "string" && walk(c)); };
  walk(ast); return aside;
};
const childSources = (el) => el.children.filter((c) => c.type !== "JSXText" || c.value.trim()).map((c) => source.slice(c.range[0], c.range[1]));

describe("page Diables — classement FIFA et ordre des blocs", () => {
  it("le classement de groupe est le premier bloc de la colonne, au-dessus du FIFA", () => {
    const blocks = childSources(asideOf());
    expect(blocks[0]).toMatch(/^<NationalGroupStandings /);
    const fifaIndex = blocks.findIndex((b) => b.includes("config.labels.fifa"));
    expect(fifaIndex).toBeGreaterThan(0);
  });
  it("le bloc FIFA n'est rendu que pour l'équipe A masculine (condition de rendu, pas de CSS)", () => {
    const fifa = childSources(asideOf()).find((b) => b.includes("config.labels.fifa"));
    expect(fifa).toMatch(/^\{showFifa && rankings\.fifa\.length > 0 && <ModuleCard>/);
    expect(source).toContain("const showFifa = isSeniorMenTeam(selectedTeam);");
  });
  it("la tuile FIFA disparaît pour les jeunes, sans case vide (3 colonnes)", () => {
    expect(source).toContain("...(showFifa ? [[fifaRank, config.labels.stats_fifa, \"text-amber-300\"]] : [])");
    expect(source).toContain("statTiles.length === 4 ? \"grid-cols-2 sm:grid-cols-4\" : \"grid-cols-3\""); // 2 × 2 sur mobile (débordement à 390 px)
    expect(source.indexOf("const statTiles")).toBeGreaterThan(source.indexOf("const record = useMemo")); // déclaré après « record »
  });
  it("titre : « Red Flames » pour l'équipe A féminine, pas celui des Diables", () => {
    expect(source).toContain("{!selectedTeam || isSeniorMenTeam(selectedTeam) ? config.hero.title : categoryLabel(selectedTeam)}");
  });
  it("règle partagée : plus de copie locale des catégories dans la page et l'annuaire", () => {
    for (const file of ["app/diables-rouges/page.js", "components/football/NationalTeamDirectory.js"]) {
      const text = fs.readFileSync(file, "utf8");
      expect(text).not.toMatch(/const CATEGORY_LABELS|const CATEGORY_ORDER|inferredCategory/);
      expect(text).toContain("@/lib/nationalCategories");
    }
    expect(source).toContain("const sorted = pickNationalTabs(candidates, activity);");
  });
  it("le classement de groupe utilise la règle de la page compétition", () => {
    const ngs = fs.readFileSync("components/football/NationalGroupStandings.js", "utf8");
    expect(ngs).toContain("selectionGroupStanding({ competition, seasonLabel: season?.label, matches: seasonMatches || [], teamId, isKnockout: isKnockoutPhase })");
  });
});
