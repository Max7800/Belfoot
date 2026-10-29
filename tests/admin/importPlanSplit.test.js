import fs from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { HIDDEN_COMPETITIONS_KEY, matchesQuery, readViewPrefs, toggleInList, VIEW_PREFS_PREFIX, visibleItems, writeViewPrefs } from "@/lib/adminViewPrefs";
import { adminSections } from "@/config/admin";

const memoryStore = (initial = {}) => { const data = { ...initial }; return { data, getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); } }; };
const brokenStore = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };

describe("préférences d'affichage (navigateur seulement)", () => {
  it("lecture : défauts si absent, illisible, mauvais type ou stockage indisponible", () => {
    expect(readViewPrefs("x", { a: 1 }, memoryStore())).toEqual({ a: 1 });
    expect(readViewPrefs("x", { a: 1 }, memoryStore({ [`${VIEW_PREFS_PREFIX}x`]: "{pas du json" }))).toEqual({ a: 1 });
    expect(readViewPrefs("x", [], memoryStore({ [`${VIEW_PREFS_PREFIX}x`]: '{"a":1}' }))).toEqual([]);
    expect(readViewPrefs("x", { a: 1 }, memoryStore({ [`${VIEW_PREFS_PREFIX}x`]: "[1]" }))).toEqual({ a: 1 });
    expect(readViewPrefs("x", { a: 1 }, brokenStore)).toEqual({ a: 1 });
    expect(readViewPrefs("x", { a: 1 }, null)).toEqual({ a: 1 });
  });
  it("lecture : valeurs enregistrées complétées par les défauts (nouveaux filtres)", () => {
    expect(readViewPrefs("f", { onlyAllowed: false, showHidden: false }, memoryStore({ [`${VIEW_PREFS_PREFIX}f`]: '{"onlyAllowed":true}' }))).toEqual({ onlyAllowed: true, showHidden: false });
  });
  it("écriture : préfixée, JSON ; stockage indisponible → false sans exception", () => {
    const store = memoryStore();
    expect(writeViewPrefs(HIDDEN_COMPETITIONS_KEY, ["c1"], store)).toBe(true);
    expect(store.data[`${VIEW_PREFS_PREFIX}hidden-competitions`]).toBe('["c1"]');
    expect(writeViewPrefs("x", 1, brokenStore)).toBe(false);
  });
  it("recherche : casse et accents ignorés, tous les mots requis, champs multiples", () => {
    expect(matchesQuery(["Première Ligue", "Égypte"], "egypte")).toBe(true);
    expect(matchesQuery(["Pro League", "Belgium"], "pro belg")).toBe(true);
    expect(matchesQuery(["Pro League"], "pro liga")).toBe(false);
    expect(matchesQuery(["Pro League", null, 144], "144")).toBe(true);
    expect(matchesQuery(["x"], "   ")).toBe(true);
  });
  it("masquer / réafficher : identifiants en texte", () => {
    expect(toggleInList([], 12)).toEqual(["12"]);
    expect(toggleInList(["12", "a"], "12")).toEqual(["a"]);
  });
  it("filtre combiné : masquées exclues sauf demande, autorisées seulement, recherche", () => {
    const items = [{ id: "a", name: "Pro League" }, { id: "b", name: "LaLiga" }, { id: "c", name: "Premier League" }];
    const allowed = (item) => item.id !== "b";
    expect(visibleItems(items, { hidden: ["c"] }).map((item) => item.id)).toEqual(["a", "b"]);
    expect(visibleItems(items, { hidden: ["c"], showHidden: true }).map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(visibleItems(items, { onlyAllowed: true, isAllowed: allowed }).map((item) => item.id)).toEqual(["a", "c"]);
    expect(visibleItems(items, { query: "league", hidden: ["a"] }).map((item) => item.id)).toEqual(["c"]);
  });
});

describe("découpage de l'ancienne page « Plan d'import » en trois pages", () => {
  const files = { plan: "components/admin/ImportPlanPanel.js", seasons: "components/admin/SeasonActivationPanel.js", maintenance: "components/admin/DataMaintenancePanel.js", shared: "components/admin/importPlanShared.js" };
  const code = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
  const espree = createRequire(import.meta.url)("espree");
  it("les quatre fichiers sont du JSX valide", () => {
    for (const [key, source] of Object.entries(code)) expect(() => espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } }), key).not.toThrow();
  });
  // Chaque action de l'ancienne page existe UNE seule fois, dans la bonne page.
  const actions = {
    plan: ["const save = async () => {", "await updateSiteSettings(supabase, { football_import_plan: storedPlan }, { expected: { football_import_plan: loadedPlan.current } });", "const addSeason = () => {", "const removeSeason = (label) => {", "importPlanSchedule(plan, competitions, nationalTeams)"],
    seasons: ["const markReady = async (season) => {", "const activate = async (season) => {", "supabase.rpc(\"activate_competition_season\", { target_season: season.id })", "const auditSeason = async (seasonId) => {", "const auditVisibleSeasons = async () => {"],
    maintenance: ["<RelinkPanel />", "const analyzeDuplicates = async () => {", "const analyzeMaintenance = async () => {", "const saveCoverage = async () => {", "const previewPurge = async () => {", "const applyPurge = async () => {", "action: \"archive\", confirmation: purgeConfirmation"],
    shared: ["export const requestReadiness =", "export const requestMaintenance =", "export function distinctProviderCompetitions("],
  };
  it("chaque action présente une seule fois, à sa place", () => {
    for (const [home, snippets] of Object.entries(actions)) {
      for (const snippet of snippets) {
        for (const [key, source] of Object.entries(code)) expect(source.split(snippet).length - 1, `${snippet} dans ${key}`).toBe(key === home ? 1 : 0);
      }
    }
  });
  it("confirmations conservées : activation, purge (nom recopié + confirmation finale)", () => {
    expect(code.seasons).toContain("if (!window.confirm(`Activer ${season.label} sur le site public ?");
    expect(code.maintenance).toContain("if (!purgePreview || purgeConfirmation !== maintenanceReport?.competition?.name) return;");
    expect(code.maintenance).toContain("if (!window.confirm(\"Dernière confirmation : archiver les effectifs secondaires");
  });
  it("archivage : changer de saison (choix OU filtre) efface rapport et simulation", () => {
    expect(code.maintenance).toMatch(/useEffect\(\(\) => \{\s*setMaintenanceReport\(null\); setPurgePreview\(null\); setPurgeConfirmation\(""\); setMaintenanceStatus\("idle"\);\s*\}, \[maintenanceSeasonId\]\);/);
  });
  it("compétitions chargées AVEC ext (rangement par pays de « Étranger »)", () => {
    expect(code.shared).toContain('export const PLAN_COMPETITION_COLUMNS = "id,name,external_id,provider,public_visible,competition_scope,ext";');
    for (const key of ["plan", "seasons", "maintenance"]) expect(code[key]).toContain('supabase.from("competitions").select(PLAN_COMPETITION_COLUMNS)');
  });
  it("masquage = affichage seulement : jamais écrit dans le plan", () => {
    expect(code.plan).not.toMatch(/football_import_plan[^\n]*hidden/);
    expect(code.plan).toContain("const [hidden, setHidden] = useViewPrefs(HIDDEN_COMPETITIONS_KEY, []);");
    expect(code.seasons).toContain("const [hidden, setHidden] = useViewPrefs(HIDDEN_COMPETITIONS_KEY, []);"); // partagé
    expect(code.plan).toContain("qui continueront d’être importées"); // les masquées autorisées sont signalées
  });
  it("menu Synchronisation : l'utile d'abord, lecture et réglages en retrait (30/10/2026)", () => {
    const panels = adminSections.find((section) => section.label === "Synchronisation").panels;
    expect(panels.map((panel) => panel.key)).toEqual(["jobs", "sync-history", "import-plan", "season-activation", "data-maintenance", "sync-overview", "system-status", "live-strategy", "providers"]);
    expect(panels.filter((panel) => panel.secondary).map((panel) => panel.key)).toEqual(["sync-overview", "system-status", "live-strategy", "providers"]);
    const registry = fs.readFileSync("components/admin/registry.js", "utf8");
    expect(registry).toContain('if (key === "season-activation") return { Comp: SeasonActivationPanel, props: {} };');
    expect(registry).toContain('if (key === "data-maintenance") return { Comp: DataMaintenancePanel, props: {} };');
  });
});
