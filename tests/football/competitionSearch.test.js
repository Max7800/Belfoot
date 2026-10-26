import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rows: {} }));
vi.mock("@/lib/supabaseClient", () => {
  const query = (table) => {
    const state = { pattern: null };
    const builder = {
      select: () => builder,
      ilike: (_column, pattern) => { state.pattern = pattern.replace(/%/g, "").toLowerCase(); return builder; },
      limit: () => builder,
      then: (resolve) => resolve({ data: (db.rows[table] || []).filter((row) => !state.pattern || row.name.toLowerCase().includes(state.pattern)), error: null }),
    };
    return builder;
  };
  return { supabase: { from: query } };
});
const { default: footballSearch, matchingCompetitions } = await import("@/modules/football/search");
const { matchesQuery, foldText } = await import("@/lib/textMatch");

const COMPETITIONS = [
  { id: "c-144", name: "Pro League", slug: "jupiler-pro-league", public_visible: true, competition_scope: "belgique" },
  { id: "c-145", name: "Challenger Pro League", slug: "challenger-pro-league", public_visible: true, competition_scope: "belgique" },
  { id: "c-307", name: "Pro League", slug: null, public_visible: false, competition_scope: "etranger" }, // Arabie saoudite, masquée
  { id: "c-848", name: "Conférence League", slug: "conference-league", public_visible: true, competition_scope: "europe" },
  { id: "c-850", name: "UEFA U21 Championship - Qualification", slug: "international-850", header_title: "Euro Espoirs — qualifications", public_visible: true, competition_scope: "international" },
];

describe("recherche de compétitions", () => {
  it("compétitions visibles seulement : la Pro League saoudienne masquée n'apparaît pas", () => {
    expect(matchingCompetitions(COMPETITIONS, "pro league").map((row) => row.id)).toEqual(["c-144", "c-145"]);
  });
  it("sans accents ni majuscules ; slug pris en compte", () => {
    expect(matchingCompetitions(COMPETITIONS, "CONFERENCE").map((row) => row.id)).toEqual(["c-848"]);
    expect(matchingCompetitions(COMPETITIONS, "jupiler").map((row) => row.id)).toEqual(["c-144"]);
  });
  it("titre du bandeau : cherché et affiché ; portée en sous-titre ; lien canonique", () => {
    expect(matchingCompetitions(COMPETITIONS, "espoirs")).toEqual([{ id: "c-850", type: "competition", typeLabel: "Compétitions", title: "Euro Espoirs — qualifications", subtitle: "Sélections", url: "/competitions/international-850" }]);
    expect(matchingCompetitions(COMPETITIONS, "pro league")[0]).toMatchObject({ subtitle: "Belgique", url: "/competitions/jupiler-pro-league" });
  });
  it("homonymes visibles sans slug : chacun mène à SA page (même règle que le reste du site)", () => {
    const twins = [{ id: "a", name: "Super Cup", public_visible: true }, { id: "b", name: "Super Cup", public_visible: true }];
    // La route lisible résout vers le premier ; l'autre est lié par identifiant.
    expect(matchingCompetitions(twins, "super cup").map((row) => row.url)).toEqual(["/competitions/super-cup", "/competitions/b"]);
  });
  it("les compétitions masquées ne prennent jamais la place des visibles dans la limite", () => {
    const hidden = Array.from({ length: 12 }, (_, index) => ({ id: `h${index}`, name: `Coupe ${index}`, slug: `coupe-${index}`, public_visible: false }));
    const visible = { id: "v", name: "Coupe de Belgique", slug: "coupe-de-belgique", public_visible: true };
    expect(matchingCompetitions([...hidden, visible], "coupe").map((row) => row.id)).toEqual(["v"]);
  });
  it("requête vide : aucun résultat ; au plus 10 compétitions", () => {
    expect(matchingCompetitions(COMPETITIONS, "  ")).toEqual([]);
    const many = Array.from({ length: 15 }, (_, index) => ({ id: `x${index}`, name: `Coupe ${index}`, slug: `coupe-${index}`, public_visible: true }));
    expect(matchingCompetitions(many, "coupe")).toHaveLength(10);
  });
});

describe("fournisseur football", () => {
  it("types : Compétitions, Clubs, Joueurs ; compétitions en premier", async () => {
    expect(footballSearch.types.map((type) => type.key)).toEqual(["competition", "club", "player"]);
    db.rows = { competitions: COMPETITIONS, clubs: [{ id: "k1", name: "OH Leuven Pro" }], players: [] };
    const results = await footballSearch.search("pro league");
    expect(results.map((row) => [row.type, row.id])).toEqual([["competition", "c-144"], ["competition", "c-145"]]);
    const leuven = await footballSearch.search("leuven");
    expect(leuven.map((row) => [row.type, row.id])).toEqual([["club", "k1"]]);
  });
});

describe("textMatch", () => {
  it("accents retirés par la classe Unicode des marques (\\p{M})", () => {
    expect(foldText("Conférence Léague Ça")).toBe("conference league ca");
    expect(matchesQuery(["Égypte"], "egypte")).toBe(true);
    expect(matchesQuery(["Pro League"], "pro liga")).toBe(false);
  });
});
