import fs from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { competitionHref, competitionHrefs } from "@/lib/competitionLinks";
import { resolveCompetitionRoute } from "@/lib/competitionRoutes";

// Extrait réel de la production (lecture seule, 14/10) : trois « Pro League »
// homonymes, slugs non normalisés, compétitions masquées sans slug.
const ALL = [
  { id: "c-144", name: "Pro League", slug: "jupiler-pro-league", external_id: "144", public_visible: true },
  { id: "c-301", name: "Pro League", slug: null, external_id: "301", public_visible: false },
  { id: "c-307", name: "Pro League", slug: null, external_id: "307", public_visible: false },
  { id: "c-145", name: "Challenger Pro League", slug: "challenger-pro-league", external_id: "145", public_visible: true },
  { id: "c-147", name: "Croky Cup", slug: "Croky Cup", external_id: "147", public_visible: true },
  { id: "c-850", name: "UEFA U21 Championship - Qualification", slug: "international-850", external_id: "850", public_visible: true },
  { id: "c-218", name: "Bundesliga", slug: null, external_id: "218", public_visible: true },
  { id: "c-78", name: "Bundesliga", slug: null, external_id: "78", public_visible: true },
];
const byId = (id) => ALL.find((row) => row.id === id);
// Le lien doit ouvrir CETTE compétition avec la vraie route du site.
const opens = (href) => resolveCompetitionRoute(ALL, decodeURIComponent(href.replace(/^\/competitions\//, "")))?.id;

describe("competitionHref — compétition connue de Belfoot", () => {
  it("lien canonique vers la bonne page", () => {
    expect(competitionHref(byId("c-144"), ALL)).toBe("/competitions/jupiler-pro-league");
    expect(opens(competitionHref(byId("c-144"), ALL))).toBe("c-144");
    expect(competitionHref(byId("c-850"), ALL)).toBe("/competitions/international-850");
  });

  it("slug ancien non normalisé (« Croky Cup ») : URL canonique qui ouvre bien la page", () => {
    const href = competitionHref(byId("c-147"), ALL);
    expect(href).toBe("/competitions/croky-cup");
    expect(opens(href)).toBe("c-147");
  });

  it("noms proches (« Pro League » / « Challenger Pro League ») : jamais confondus", () => {
    expect(opens(competitionHref(byId("c-144"), ALL))).toBe("c-144");
    expect(opens(competitionHref(byId("c-145"), ALL))).toBe("c-145");
  });

  it("homonymes sans slug : le second passe par son identifiant, jamais par la page de l'autre", () => {
    const first = competitionHref(byId("c-218"), ALL);
    const second = competitionHref(byId("c-78"), ALL);
    expect(opens(first)).toBe("c-218");
    expect(second).toBe("/competitions/c-78");
    expect(opens(second)).toBe("c-78");
  });

  it("liste de vérification indisponible : lien par identifiant, toujours exact", () => {
    expect(competitionHref(byId("c-78"), null)).toBe("/competitions/c-78");
    expect(competitionHref(byId("c-78"), [])).toBe("/competitions/c-78");
    expect(opens(competitionHref(byId("c-78"), null))).toBe("c-78");
  });

  it("identifiant avec caractères spéciaux : encodé", () => {
    expect(competitionHref({ id: "a b/c", name: "X" }, null)).toBe("/competitions/a%20b%2Fc");
  });
});

describe("competitionHref — pas de lien cassé", () => {
  it("compétition inconnue (aucune ligne) : pas de lien", () => {
    expect(competitionHref(undefined, ALL)).toBeNull();
    expect(competitionHref(null, ALL)).toBeNull();
  });

  it("identifiant absent ou invalide : pas de lien", () => {
    for (const id of [undefined, null, "", "   "]) expect(competitionHref({ id, name: "Pro League", slug: "jupiler-pro-league" }, ALL)).toBeNull();
  });

  it("compétition masquée au public (ex. Pro League 301 importée pour les carrières) : pas de lien", () => {
    expect(competitionHref(byId("c-301"), ALL)).toBeNull();
    expect(competitionHref(byId("c-307"), ALL)).toBeNull();
  });

  it("visibilité non renseignée : traitée comme publique (valeur par défaut de la base)", () => {
    expect(competitionHref({ id: "c-145", name: "Challenger Pro League", slug: "challenger-pro-league" }, ALL)).toBe("/competitions/challenger-pro-league");
  });
});

describe("competitionHrefs — données incomplètes", () => {
  it("indexe par identifiant, ignore les entrées vides sans planter", () => {
    const links = competitionHrefs({ "c-144": byId("c-144"), "c-301": byId("c-301"), x: null, y: {}, z: { name: "Sans id" } }, ALL);
    expect(links).toEqual({ "c-144": "/competitions/jupiler-pro-league", "c-301": null });
  });
  it("aucune compétition : objet vide", () => {
    expect(competitionHrefs(undefined, ALL)).toEqual({});
    expect(competitionHrefs({}, null)).toEqual({});
  });
});

// ── Fiche joueur : analyse du JSX réel ───────────────────────────────────────
const source = fs.readFileSync("app/players/[id]/page.js", "utf8");
const espree = createRequire(import.meta.url)("espree");
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } });
function walk(node, visit, ancestors = []) {
  if (!node || typeof node.type !== "string") return;
  visit(node, ancestors);
  for (const value of Object.values(node)) {
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) if (child && typeof child === "object" && typeof child.type === "string") walk(child, visit, [...ancestors, node]);
  }
}
const elementName = (node) => node.type === "JSXElement" ? node.openingElement.name.name : null;
const attr = (node, name) => node.openingElement.attributes.find((a) => a.name?.name === name);

describe("fiche joueur — câblage des liens de compétition", () => {
  it("aucun lien imbriqué dans un autre lien (HTML invalide, clic ambigu)", () => {
    const nested = [];
    walk(ast, (node, ancestors) => {
      if (elementName(node) === "Link" && ancestors.some((a) => elementName(a) === "Link")) nested.push(node.loc.start.line);
    });
    expect(nested).toEqual([]);
  });

  it("le nom de compétition passe par CompetitionName aux trois endroits (carte de match, stats mobile, stats bureau)", () => {
    const uses = [];
    walk(ast, (node) => { if (elementName(node) === "CompetitionName") uses.push(attr(node, "fallback")?.value?.value); });
    expect(uses.sort()).toEqual(["Match", "Non attribuée", "Non attribuée"]);
  });

  it("le lien n'est donné que pour une compétition chargée, par son identifiant", () => {
    expect(source).toContain("href={competition ? competitionLinks[String(match.competition_id)] : null}");
    expect((source.match(/href=\{competitions\[stat\.competition_id\] \? competitionLinks\[String\(stat\.competition_id\)\] : null\}/g) || []).length).toBe(2);
  });

  it("la carte de match reste cliquable vers le match, avec un libellé accessible", () => {
    let overlay = null;
    walk(ast, (node) => { if (elementName(node) === "Link" && attr(node, "aria-label") && /absolute inset-0/.test(attr(node, "className")?.value?.value || "")) overlay = node; });
    expect(overlay).not.toBeNull();
    expect(source).toMatch(/<Link href=\{`\/matchs\/\$\{match\.id\}`\} aria-label=/);
  });

  it("les données chargent le slug et la visibilité ; la vérification des URL est facultative", () => {
    expect(source).toContain(`select("id,name,slug,public_visible,logo_url,provider,competition_scope,competition_type,ext").in("id", competitionIds)`);
    expect(source).toContain(`competitionRoutes: routesResult.error ? null : (routesResult.data || [])`);
    expect(source).toContain("competitionHrefs(state.competitions, state.competitionRoutes)");
  });

  it("aucun texte JSX ne contient de code (même garde-fou que les pages de compétition)", () => {
    const leaked = [];
    walk(ast, (node) => { if (node.type === "JSXText" && /competitionLinks|competition\?\.|\? <|^\($|^\)$/.test(node.value.trim())) leaked.push(node.value.trim()); });
    expect(leaked).toEqual([]);
  });
});
