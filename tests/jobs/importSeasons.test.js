import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ADDED_SEASON_ROLE, IMPORT_SEASONS, addImportSeason, assertImportTargetAllowed, hydrateCompetitionConfig, hydrateNationalConfig,
  importPlanEstimate, isImportSeasonLabel, normalizeImportPlan, orderedImportTargets, removeImportSeason,
} from "@/lib/importPlan";
import { JOB_CATALOG } from "@/lib/jobCatalog";
import { resolveJobScope } from "@/lib/jobScope";
import { requestedApiYear, summarizeLeagueCheck } from "@/lib/leagueCheck";
import leagueCheckJob from "@/modules/football/jobs/leagueCheck";
import { registerProvider } from "@/modules/football/providers";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const BASE = IMPORT_SEASONS.map((season) => season.label);
const PRO_LEAGUE = { id: "c-144", name: "Pro League", external_id: "144" };
const U21 = { id: "c-850", name: "UEFA U21 Championship - Qualification", external_id: "850", competition_scope: "international" };
const labels = (plan) => plan.seasons.map((season) => season.label);

describe("plan d'import — saisons de base inchangées", () => {
  it("plan vide : les trois saisons de base, activées", () => {
    const plan = normalizeImportPlan({});
    expect(labels(plan)).toEqual(BASE);
    expect(plan.seasons.every((season) => season.enabled)).toBe(true);
  });
  it("plan enregistré : une saison de base absente reste activée, une désactivée le reste", () => {
    const plan = normalizeImportPlan({ version: 4, seasons: [{ label: "2024-2025", enabled: false }, { label: "2025-2026", enabled: true }] });
    expect(plan.seasons.map((s) => [s.label, s.enabled])).toEqual([["2024-2025", false], ["2025-2026", true], ["2026-2027", true]]);
  });
});

describe("plan d'import — saisons ajoutées (aucune année codée en dur)", () => {
  it("une saison enregistrée au-delà de la liste est conservée, désactivée sauf activation explicite", () => {
    const plan = normalizeImportPlan({ version: 4, seasons: [{ label: "2027-2028" }, { label: "2031-2032", enabled: true }] });
    expect(labels(plan)).toEqual([...BASE, "2027-2028", "2031-2032"]);
    expect(plan.seasons.slice(3).map((s) => [s.label, s.role, s.enabled])).toEqual([["2027-2028", ADDED_SEASON_ROLE, false], ["2031-2032", ADDED_SEASON_ROLE, true]]);
  });

  it("libellés invalides, doublons et saisons de base ne sont jamais ajoutés", () => {
    const plan = normalizeImportPlan({ version: 4, seasons: [
      { label: "2027", enabled: true }, { label: "2027-2029", enabled: true }, { label: "abcd-efgh", enabled: true }, { label: "", enabled: true }, { label: null, enabled: true },
      { label: "2027-2028", enabled: true }, { label: "2027-2028", enabled: false }, { label: "2025-2026", enabled: true },
    ] });
    expect(labels(plan)).toEqual([...BASE, "2027-2028"]);
    expect(plan.seasons.at(-1).enabled).toBe(true);
  });

  it("isImportSeasonLabel : libellé canonique uniquement (jamais l'année civile par défaut)", () => {
    expect(isImportSeasonLabel("2027-2028")).toBe(true);
    expect(isImportSeasonLabel(" 2031-2032 ")).toBe(true);
    for (const value of ["", undefined, "2027", "2027-2029", "2027/2028", "1889-1890", "2101-2102"]) expect(isImportSeasonLabel(value)).toBe(false);
  });

  it("hydratation : une saison ajoutée n'hérite jamais de l'activation d'une compétition", () => {
    const seasons = normalizeImportPlan({ version: 4, seasons: [{ label: "2027-2028" }] }).seasons;
    const config = hydrateCompetitionConfig(PRO_LEAGUE, { enabled: true }, 0, { seasons });
    expect(config.seasons["2026-2027"].enabled).toBe(true); // comportement de base inchangé
    expect(config.seasons["2027-2028"]).toMatchObject({ enabled: false, scope: "base" });
    const enabled = hydrateCompetitionConfig(U21, { enabled: true, seasons: { "2027-2028": { enabled: true, scope: "base", expected_clubs: 52, expected_matches: 250 } } }, 0, { seasons });
    expect(enabled.seasons["2027-2028"]).toEqual({ enabled: true, scope: "base", expected_clubs: 52, expected_matches: 250 });
    const national = hydrateNationalConfig({ enabled: true }, 0, { seasons });
    expect(national.seasons["2027-2028"]).toMatchObject({ enabled: false, scope: "base" });
  });

  it("sans saisons fournies, l'hydratation reste celle d'avant (trois saisons)", () => {
    expect(Object.keys(hydrateCompetitionConfig(PRO_LEAGUE, {}, 0).seasons)).toEqual(BASE);
  });

  it("budget : une saison ajoutée désactivée ne coûte rien ; activée en « base », 4 appels", () => {
    const disabled = { version: 4, seasons: [{ label: "2027-2028" }], competitions: { "c-850": { enabled: true, seasons: { "2027-2028": { enabled: false, scope: "base" } } } } };
    expect(importPlanEstimate(disabled).bySeason["2027-2028"]).toBe(0);
    const enabled = { version: 4, seasons: [{ label: "2027-2028", enabled: true }], competitions: { "c-850": { enabled: true, seasons: { "2027-2028": { enabled: true, scope: "base" } } } } };
    expect(importPlanEstimate(enabled).bySeason["2027-2028"]).toBe(4);
    expect(orderedImportTargets(enabled, [U21], [], "2027-2028").map((t) => [t.id, t.season])).toEqual([["c-850", "2027-2028"]]);
  });
});

describe("plan d'import — ajout et retrait depuis l'administration", () => {
  const base = () => ({ ...normalizeImportPlan({ version: 4 }), competitions: { "c-144": { enabled: true, expected_clubs: 18, expected_matches: 306, seasons: {} } }, nationalTeams: { "1": { enabled: true, expected_matches: 12, seasons: {} } } });

  it("ajout : saison désactivée partout (plan, compétitions, sélections)", () => {
    const { plan, error } = addImportSeason(base(), " 2027-2028 ");
    expect(error).toBeUndefined();
    expect(plan.seasons.at(-1)).toMatchObject({ label: "2027-2028", role: ADDED_SEASON_ROLE, enabled: false });
    expect(plan.competitions["c-144"].seasons["2027-2028"]).toEqual({ enabled: false, scope: "base", expected_clubs: 18, expected_matches: 306 });
    expect(plan.nationalTeams["1"].seasons["2027-2028"]).toMatchObject({ enabled: false, scope: "base" });
  });

  it("ajout refusé : libellé invalide ou déjà présent", () => {
    expect(addImportSeason(base(), "2027").error).toMatch(/AAAA-AAAA/);
    expect(addImportSeason(base(), "2025-2026").error).toMatch(/déjà/);
  });

  it("retrait : seulement une saison ajoutée, et partout", () => {
    const { plan } = addImportSeason(base(), "2027-2028");
    const removed = removeImportSeason(plan, "2027-2028").plan;
    expect(labels(removed)).toEqual(BASE);
    expect(removed.competitions["c-144"].seasons["2027-2028"]).toBeUndefined();
    expect(removeImportSeason(plan, "2025-2026").error).toMatch(/ajoutées/);
  });

  it("aller-retour enregistrement : la saison ajoutée survit à la normalisation", () => {
    const { plan } = addImportSeason(base(), "2027-2028");
    const saved = JSON.parse(JSON.stringify({ ...plan, version: 4 }));
    expect(labels(normalizeImportPlan(saved))).toEqual([...BASE, "2027-2028"]);
  });
});

describe("garde du préflight — import d'une saison ajoutée", () => {
  const db = (plan) => createFakeSupabase({ site_settings: [{ id: 1, data: { football_import_plan: plan } }] });
  const sync = JOB_CATALOG["football.sync"];
  const ctx = { competitionId: "c-850", season: "2027-2028" };

  it("saison absente du plan : refusée", async () => {
    await expect(assertImportTargetAllowed(db({ version: 4 }), "football.sync", ctx, sync)).rejects.toThrow(/2027-2028 n'est pas autorisée/);
  });
  it("saison ajoutée mais désactivée : refusée", async () => {
    await expect(assertImportTargetAllowed(db({ version: 4, seasons: [{ label: "2027-2028" }], competitions: { "c-850": { enabled: true, seasons: { "2027-2028": { enabled: true, scope: "base" } } } } }), "football.sync", ctx, sync)).rejects.toThrow(/n'est pas autorisée dans le plan/);
  });
  it("saison activée mais compétition non activée pour elle : refusée", async () => {
    await expect(assertImportTargetAllowed(db({ version: 4, seasons: [{ label: "2027-2028", enabled: true }], competitions: { "c-850": { enabled: true, seasons: {} } } }), "football.sync", ctx, sync)).rejects.toThrow(/pas autorisée pour 2027-2028/);
  });
  it("saison et compétition activées : autorisée", async () => {
    await expect(assertImportTargetAllowed(db({ version: 4, seasons: [{ label: "2027-2028", enabled: true }], competitions: { "c-850": { enabled: true, seasons: { "2027-2028": { enabled: true, scope: "base" } } } } }), "football.sync", ctx, sync)).resolves.toBeUndefined();
  });
});

// ── Diagnostic « Vérifier la compétition » ──────────────────────────────────
const LEAGUE = { name: "UEFA U21 Championship - Qualification", type: "Cup", seasons: [
  { year: 2027, start: "2025-03-21", end: "2026-11-17", current: true, coverage: { standings: true } },
  { year: 2023, start: "2021-03-24", end: "2022-06-14", current: false, coverage: { standings: true } },
  { year: 2025, start: "2023-03-22", end: "2024-11-19", current: false, coverage: { standings: false } },
] };
const STANDINGS = [
  [{ group: "Group A", team: { id: 1 } }, { group: "Group A", team: { id: 2 } }],
  [{ group: "Group B", team: { id: 3 } }, { group: "Group B", team: { id: 4 } }],
  [{ group: "Ranking of second-placed teams", team: { id: 2 } }],
];

describe("diagnostic de ligue — synthèse", () => {
  it("saisons API triées, dates, saison en cours, couverture ; groupes ; saisons Belfoot", () => {
    const text = summarizeLeagueCheck({ competition: U21, league: LEAGUE, standingsYear: "2027", standings: STANDINGS, belfootSeasons: [{ label: "2027-2028", import_status: "draft", matches: 8 }, { label: "2023-2024", import_status: "ready", public_active: false, matches: 8 }] });
    expect(text).toContain("UEFA U21 Championship - Qualification (API 850, Cup)");
    expect(text).toContain("saisons API : 2023 [2021-03-24 → 2022-06-14, classements oui] · 2025 [2023-03-22 → 2024-11-19, classements non] · 2027 [2025-03-21 → 2026-11-17, en cours, classements oui]");
    expect(text).toContain("classement 2027 : 3 groupe(s), 5 ligne(s) (Group A, Group B, Ranking of second-placed teams)");
    expect(text).toContain("Belfoot : 2023-2024 ready 8 match(s) · 2027-2028 draft 8 match(s)");
    expect(text).toContain("aucune écriture sportive");
  });
  it("sans saison choisie : pas de ligne de classement ; réponses vides gérées", () => {
    const text = summarizeLeagueCheck({ competition: U21, league: null, standingsYear: null, standings: null, belfootSeasons: [] });
    expect(text).not.toContain("classement ");
    expect(text).toContain("saisons API : aucune");
    expect(text).toContain("Belfoot : aucune saison");
    expect(summarizeLeagueCheck({ competition: U21, league: LEAGUE, standingsYear: "2027", standings: [] })).toContain("classement 2027 : aucun");
  });
  it("année demandée : explicite seulement, jamais l'année civile par défaut", () => {
    expect(requestedApiYear("2027-2028")).toBe("2027");
    expect(requestedApiYear("2027")).toBe("2027");
    for (const value of ["", undefined, null, "saison"]) expect(requestedApiYear(value)).toBeNull();
  });
});

describe("diagnostic de ligue — job en lecture seule", () => {
  let calls;
  beforeEach(() => {
    calls = [];
    registerProvider({
      key: "apifootball",
      async fetchLeagueSeasons(competition) { calls.push(["leagues", competition.external_id]); return LEAGUE; },
      async fetchStandings(competition, ctx) { calls.push(["standings", competition.external_id, ctx.season]); return STANDINGS; },
    });
  });
  const seed = () => ({
    competitions: [{ id: "c-850", name: U21.name, provider: "apifootball", external_id: "850", ext: { keep: true } }],
    seasons: [{ id: "s-2027", competition_id: "c-850", label: "2027-2028", import_status: "draft", public_active: false }],
    matches: [{ id: "m1", competition_id: "c-850", season_id: "s-2027" }, { id: "m2", competition_id: "c-850", season_id: "s-2027" }],
  });

  it("deux appels au plus, aucune écriture en base", async () => {
    const db = createFakeSupabase(seed());
    const before = JSON.stringify(["competitions", "seasons", "matches"].map((t) => db.rows(t)));
    const text = await leagueCheckJob.run({ db, competitionId: "c-850", season: "2027-2028" });
    expect(calls).toEqual([["leagues", "850"], ["standings", "850", "2027"]]);
    expect(JSON.stringify(["competitions", "seasons", "matches"].map((t) => db.rows(t)))).toBe(before);
    expect(text).toContain("Belfoot : 2027-2028 draft 2 match(s)");
  });

  it("sans saison choisie : un seul appel", async () => {
    await leagueCheckJob.run({ db: createFakeSupabase(seed()), competitionId: "c-850" });
    expect(calls).toEqual([["leagues", "850"]]);
  });

  it("compétition absente ou hors API-Football : aucun appel", async () => {
    expect(await leagueCheckJob.run({ db: createFakeSupabase(seed()), competitionId: "inconnue" })).toMatch(/aucun appel/);
    const other = createFakeSupabase({ competitions: [{ id: "c-x", name: "X", provider: "thesportsdb", external_id: "1" }] });
    expect(await leagueCheckJob.run({ db: other, competitionId: "c-x" })).toMatch(/aucun appel/);
    expect(calls).toEqual([]);
  });

  it("sans compétition : refusé avant tout appel", async () => {
    await expect(leagueCheckJob.run({ db: createFakeSupabase(seed()) })).rejects.toThrow(/choisis une compétition/);
    expect(() => resolveJobScope("football.league-check", {})).toThrow(/périmètre manquant/);
    expect(calls).toEqual([]);
  });

  it("garde d'import : lecture seule, hors whitelist, compétition obligatoire", async () => {
    const db = createFakeSupabase({ site_settings: [{ id: 1, data: { football_import_plan: { version: 4 } } }] });
    const entry = JOB_CATALOG["football.league-check"];
    await expect(assertImportTargetAllowed(db, "football.league-check", { competitionId: "c-850", season: "2027-2028" }, entry)).resolves.toBeUndefined();
    await expect(assertImportTargetAllowed(db, "football.league-check", {}, entry)).rejects.toThrow(/Choisis une compétition/);
  });

  it("enregistré dans le registre des jobs et le préflight", () => {
    expect(fs.readFileSync("lib/jobs.js", "utf8")).toMatch(/"football\.league-check": footballLeagueCheck/);
    expect(fs.readFileSync("lib/jobPreflight.js", "utf8")).toMatch(/key === "football\.league-check"\) return \{ min: 1, max: 2/);
    expect(JOB_CATALOG["football.league-check"]).toMatchObject({ scopes: ["competition"], target: "competition", group: "base" });
  });
});

describe("panneau du plan d'import — câblage", () => {
  const source = fs.readFileSync("components/admin/ImportPlanPanel.js", "utf8");
  it("hydratation avec les saisons du plan, ajout et retrait branchés", () => {
    expect(source).toContain("resetSeasonEstimates, seasons: stored.seasons })");
    expect(source).toContain("{ resetArchiveScopes, seasons: stored.seasons })");
    expect(source).toContain("addImportSeason(plan, newSeason)");
    expect(source).toContain("removeImportSeason(plan, label)");
    expect(source).not.toContain("Plan historique 2024 → 2027");
  });
});
