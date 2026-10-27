import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { refreshSeasonFor, refreshTargets } from "@/lib/competitionRefresh";

// La vraie route du cron competition-refresh, sur un faux Supabase. runJob est
// remplacé : on vérifie QUELS jobs seraient lancés, avec quelle saison.
const state = vi.hoisted(() => ({ db: null, runs: [], coachResult: null, detailResults: {} }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => state.db }));
vi.mock("@/lib/jobs", () => ({ runJob: async (key, ctx) => { state.runs.push({ key, competitionId: ctx.competitionId, season: ctx.season, resumeState: ctx.resumeState }); if (state.detailResults[key]) return state.detailResults[key]; return key === "football.squads" ? { complete: true } : key === "football.coaches" && state.coachResult ? state.coachResult : "ok"; } }));
const { GET } = await import("@/app/api/cron/competition-refresh/route");

const SECRET = "secret-de-test";
const NOW = new Date("2026-10-18T12:00:00Z").getTime();
const H = 3600000;
const comp = (id, name, scope, extra = {}) => ({ id, name, provider: "apifootball", external_id: id, public_visible: true, competition_scope: scope, ...extra });
const season = (id, competitionId, label, status = "active", extra = {}) => ({ id, competition_id: competitionId, label, import_status: status, public_active: status === "active", ...extra });
const planFor = (entries) => ({ version: 4, seasons: [{ label: "2024-2025", enabled: false }, { label: "2025-2026", enabled: true }, { label: "2026-2027", enabled: true }, { label: "2027-2028", role: "added", enabled: true }], competitions: entries });
const allow = (label, scope = "complete") => ({ enabled: true, seasons: { [label]: { enabled: true, scope } } });

function seed({ competitions, seasons, plan, matches = [], refreshState = {}, coachState, detailState }) {
  return createFakeSupabase({
    competitions, seasons, matches,
    site_settings: [{ id: 1, data: { football_import_plan: plan, football_competition_refresh_state: refreshState, ...(coachState ? { football_coach_refresh_state: coachState } : {}), ...(detailState ? { football_match_details_state: detailState } : {}) } }],
  });
}
const PRO = comp("c-144", "Pro League", "belgique");
const U21 = comp("c-850", "UEFA U21 Qualification", "international");
const NL = comp("c-5", "UEFA Nations League", "international");
const baseSeasons = [season("s-pro", "c-144", "2026-2027"), season("s-u21-old", "c-850", "2025-2026", "ready"), season("s-u21", "c-850", "2027-2028"), season("s-nl", "c-5", "2026-2027")];
const basePlan = planFor({ "c-144": allow("2026-2027", "complete"), "c-850": { enabled: true, seasons: { "2025-2026": { enabled: true, scope: "base" }, "2027-2028": { enabled: true, scope: "base" } } }, "c-5": allow("2026-2027", "complete") });
const tick = async (dryRun = false) => (await GET(new Request(`http://localhost/api/cron/competition-refresh${dryRun ? "?dryRun=1" : ""}`, { headers: { authorization: `Bearer ${SECRET}` } }))).json();
const finished = (id, seasonId, competitionId, hoursAgo) => ({ id, season_id: seasonId, competition_id: competitionId, status: "finished", kickoff: new Date(NOW - hoursAgo * H).toISOString() });

beforeAll(() => { process.env.CRON_SECRET = SECRET; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
afterAll(() => { delete process.env.CRON_SECRET; vi.useRealTimers(); });
beforeEach(() => { state.runs = []; state.coachResult = null; state.detailResults = {}; });
// Imports et statistiques seulement (renouvellement et entraîneurs testés à part).
const PASS_KEYS = new Set(["football.campaign-rollover", "football.coaches", "football.lineups", "football.events"]);
const importRuns = () => state.runs.filter((r) => !PASS_KEYS.has(r.key));
const detailRuns = () => state.runs.filter((r) => r.key === "football.lineups" || r.key === "football.events").map((r) => [r.key, r.competitionId]);
const coachRuns = () => state.runs.filter((r) => r.key === "football.coaches");

describe("refreshTargets — règle pure", () => {
  it("saison publique de chaque compétition (active, sinon la plus récente publiée)", () => {
    expect(refreshSeasonFor([season("a", "c", "2025-2026", "ready"), season("b", "c", "2027-2028", "ready")]).label).toBe("2027-2028");
    expect(refreshSeasonFor([season("a", "c", "2025-2026"), season("b", "c", "2027-2028", "ready")]).label).toBe("2025-2026");
    expect(refreshSeasonFor([season("a", "c", "2027-2028", "draft")])).toBeNull();
  });
  it("compétitions internationales incluses ; masquées, sans fournisseur ou sans saison publiée écartées", () => {
    const { targets, skipped } = refreshTargets([PRO, U21, comp("c-x", "Masquée", "europe", { public_visible: false }), comp("c-y", "Sans saison", "belgique"), { ...comp("c-z", "Manuelle", "belgique"), provider: null }], [...baseSeasons, season("s-x", "c-x", "2026-2027"), season("s-y", "c-y", "2026-2027", "draft")]);
    expect(targets.map((t) => [t.competition.id, t.season.label, t.statsEligible])).toEqual([["c-144", "2026-2027", true], ["c-850", "2027-2028", false]]);
    expect(skipped).toEqual([{ competition: "Sans saison", reason: "aucune saison publiée" }]);
  });
});

describe("cron competition-refresh — toutes les compétitions visibles", () => {
  it("chaque compétition synchronisée sur SA saison publique, pas l'année du calendrier", async () => {
    state.db = seed({ competitions: [PRO, U21, NL], seasons: baseSeasons, plan: basePlan });
    const body = await tick();
    expect(body.ok).toBe(true);
    expect(state.runs.filter((r) => r.key === "football.sync").map((r) => [r.competitionId, r.season]).sort()).toEqual([["c-144", "2026-2027"], ["c-5", "2026-2027"], ["c-850", "2027-2028"]]);
  });

  it("compétition non autorisée par le plan pour sa saison : écartée avant tout lancement", async () => {
    const plan = planFor({ "c-144": allow("2026-2027"), "c-850": { enabled: true, seasons: { "2025-2026": { enabled: true, scope: "base" } } }, "c-5": { enabled: false, seasons: {} } });
    state.db = seed({ competitions: [PRO, U21, NL], seasons: baseSeasons, plan });
    const body = await tick();
    expect(importRuns().map((r) => r.competitionId)).toEqual(["c-144"]);
    expect(body.excluded.map((e) => e.competition).sort()).toEqual(["UEFA Nations League", "UEFA U21 Qualification"]);
  });

  it("statistiques joueurs : compétitions de clubs seulement, et seulement si le plan l'autorise", async () => {
    const matches = [finished("m1", "s-pro", "c-144", 30), finished("m2", "s-u21", "c-850", 30), finished("m3", "s-nl", "c-5", 30)];
    state.db = seed({ competitions: [PRO, U21, NL], seasons: baseSeasons, plan: basePlan, matches });
    await tick();
    expect(state.runs.filter((r) => r.key === "football.squads").map((r) => [r.competitionId, r.season])).toEqual([["c-144", "2026-2027"]]);
  });

  it("statistiques : saison publique du club, même si elle diffère du calendrier", async () => {
    const plan = planFor({ "c-144": allow("2025-2026", "complete") });
    state.db = seed({ competitions: [PRO], seasons: [season("s-pro-old", "c-144", "2025-2026", "ready")], plan, matches: [finished("m1", "s-pro-old", "c-144", 30)] });
    await tick();
    expect(importRuns().map((r) => [r.key, r.season])).toEqual([["football.sync", "2025-2026"], ["football.squads", "2025-2026"]]);
  });

  it("club au niveau « Archive résultats » : pas de passage statistiques", async () => {
    const plan = planFor({ "c-144": allow("2026-2027", "base") });
    state.db = seed({ competitions: [PRO], seasons: [baseSeasons[0]], plan, matches: [finished("m1", "s-pro", "c-144", 30)] });
    await tick();
    expect(importRuns().map((r) => r.key)).toEqual(["football.sync"]);
  });

  it("fenêtre de match : seuls les matchs de la saison rafraîchie comptent", async () => {
    // Match imminent dans une ANCIENNE saison U21 : ne doit pas déclencher la fenêtre courte.
    const matches = [{ id: "old", season_id: "s-u21-old", competition_id: "c-850", status: "scheduled", kickoff: new Date(NOW + 2 * H).toISOString() }];
    const refreshState = { "c-850": new Date(NOW - 8 * H).toISOString(), "c-144": new Date(NOW - 1 * H).toISOString(), "c-5": new Date(NOW - 1 * H).toISOString() };
    state.db = seed({ competitions: [PRO, U21, NL], seasons: baseSeasons, plan: basePlan, matches, refreshState });
    const body = await tick(true);
    expect(body.results.picked).toEqual([]); // 8 h < repos de 20 h, et pas de fenêtre active pour 2027-2028
    state.db = seed({ competitions: [PRO, U21, NL], seasons: baseSeasons, plan: basePlan, matches: [{ ...matches[0], season_id: "s-u21" }], refreshState });
    expect((await tick(true)).results.picked.map((p) => [p.competition, p.season, p.windowActive])).toEqual([["UEFA U21 Qualification", "2027-2028", true]]);
  });

  it("aucune saison publiée : rien n'est lancé", async () => {
    state.db = seed({ competitions: [U21], seasons: [season("s-u21", "c-850", "2027-2028", "draft")], plan: basePlan });
    const body = await tick();
    expect(body).toMatchObject({ ok: true, skipped: true });
    expect(state.runs).toEqual([]);
  });

  it("mode simulation : saisons retenues exposées, aucun job lancé", async () => {
    state.db = seed({ competitions: [PRO, U21, NL], seasons: baseSeasons, plan: basePlan });
    const body = await tick(true);
    expect(body.seasons).toEqual({ "Pro League": "2026-2027", "UEFA U21 Qualification": "2027-2028", "UEFA Nations League": "2026-2027" });
    expect(state.runs).toEqual([]);
  });

  it("état de rafraîchissement enregistré après un passage réussi", async () => {
    state.db = seed({ competitions: [U21], seasons: baseSeasons.filter((s) => s.competition_id === "c-850"), plan: basePlan });
    await tick();
    expect(state.db.rows("site_settings")[0].data.football_competition_refresh_state["c-850"]).toBe(new Date(NOW).toISOString());
    expect(state.db.rows("site_settings")[0].data.football_import_plan).toEqual(basePlan); // le reste des réglages est conservé
  });
});

describe("cron competition-refresh — entraîneurs chaque semaine", () => {
  // Constat du 27/10/2026 : « N. Hayen » restait l'entraîneur de Club Brugge,
  // les entraîneurs n'étant mis à jour que par un job manuel.
  it("compétition de clubs autorisée : entraîneurs vérifiés, date enregistrée ; sélections jamais", async () => {
    state.db = seed({ competitions: [PRO, U21, NL], seasons: baseSeasons, plan: basePlan });
    await tick();
    expect(coachRuns().map((r) => [r.competitionId, r.season, r.resumeState.clubIndex])).toEqual([["c-144", "2026-2027", 0]]);
    expect(state.db.rows("site_settings")[0].data.football_coach_refresh_state["c-144"]).toMatchObject({ checkedAt: new Date(NOW).toISOString(), clubIndex: 0 });
    // Pro League à jour : les compétitions de sélections ne prennent jamais le relais.
    state.runs = [];
    state.db = seed({ competitions: [PRO, U21, NL], seasons: baseSeasons, plan: basePlan, coachState: { "c-144": { checkedAt: new Date(NOW - H).toISOString(), clubIndex: 0 }, "c-850": { checkedAt: new Date(NOW - H).toISOString(), clubIndex: 0 } } });
    await tick();
    expect(coachRuns()).toEqual([]);
  });
  it("vérifiés il y a moins de 7 jours : pas de nouvel appel ; 7 jours passés : nouvelle vérification", async () => {
    state.db = seed({ competitions: [PRO], seasons: baseSeasons, plan: basePlan, coachState: { "c-144": { checkedAt: new Date(NOW - 6 * 24 * H).toISOString(), clubIndex: 0 } } });
    await tick();
    expect(coachRuns()).toEqual([]);
    state.db = seed({ competitions: [PRO], seasons: baseSeasons, plan: basePlan, coachState: { "c-144": { checkedAt: new Date(NOW - 7 * 24 * H).toISOString(), clubIndex: 0 } } });
    await tick();
    expect(coachRuns()).toHaveLength(1);
  });
  it("lot partiel : reprise au club suivant au passage suivant, même avant la semaine", async () => {
    state.coachResult = { complete: false, progress: { current: 4, total: 16 }, detail: "4/16" };
    state.db = seed({ competitions: [PRO], seasons: baseSeasons, plan: basePlan, coachState: { "c-144": { checkedAt: new Date(NOW - 2 * 24 * H).toISOString(), clubIndex: 0 } } });
    await tick();
    expect(coachRuns()).toEqual([]);
    state.db = seed({ competitions: [PRO], seasons: baseSeasons, plan: basePlan, coachState: { "c-144": { checkedAt: new Date(NOW - 8 * 24 * H).toISOString(), clubIndex: 0 } } });
    await tick();
    const saved = state.db.rows("site_settings")[0].data.football_coach_refresh_state["c-144"];
    expect(saved.clubIndex).toBe(4);
    state.runs = []; state.coachResult = null;
    await tick();
    expect(coachRuns().map((r) => r.resumeState.clubIndex)).toEqual([4]);
    expect(state.db.rows("site_settings")[0].data.football_coach_refresh_state["c-144"]).toMatchObject({ clubIndex: 0, checkedAt: new Date(NOW).toISOString() });
  });
});

describe("cron competition-refresh — détails après match", () => {
  // Constat du 27/10/2026 : aucun match d'octobre n'avait ses compositions,
  // statistiques ni notes — ces jobs n'étaient lancés qu'à la main.
  it("compétitions autorisées au niveau « Saison complète » seulement ; compositions puis faits", async () => {
    state.db = seed({ competitions: [PRO, U21, NL], seasons: baseSeasons, plan: basePlan });
    await tick();
    expect(detailRuns()).toEqual([["football.lineups", "c-144"], ["football.events", "c-144"], ["football.lineups", "c-5"], ["football.events", "c-5"]]);
    const saved = state.db.rows("site_settings")[0].data.football_match_details_state;
    expect(saved["c-144"]).toMatchObject({ doneAt: new Date(NOW).toISOString() });
    expect(saved["c-850"]).toBeUndefined(); // U21 en « Archive résultats » : jamais de détails
  });
  it("à jour : pas de nouvel appel tant qu'aucun nouveau match n'est terminé", async () => {
    const detailState = { "c-144": { doneAt: new Date(NOW - 2 * H).toISOString() }, "c-5": { doneAt: new Date(NOW - 2 * H).toISOString() } };
    state.db = seed({ competitions: [PRO, NL], seasons: baseSeasons, plan: basePlan, detailState, matches: [finished("m1", "s-pro", "c-144", 5)] });
    await tick();
    expect(detailRuns()).toEqual([]);
    state.db = seed({ competitions: [PRO, NL], seasons: baseSeasons, plan: basePlan, detailState, matches: [finished("m2", "s-pro", "c-144", 1)] });
    await tick();
    expect(detailRuns()).toEqual([["football.lineups", "c-144"], ["football.events", "c-144"]]);
  });
  it("matchs restants : la compétition repasse en fin de file, au plus 6 lots par passage", async () => {
    state.detailResults["football.lineups"] = { complete: false, detail: "1 match(s) restant(s)" };
    state.db = seed({ competitions: [PRO], seasons: baseSeasons, plan: basePlan });
    await tick();
    expect(detailRuns().filter(([key]) => key === "football.lineups")).toHaveLength(6);
    const saved = state.db.rows("site_settings")[0].data.football_match_details_state["c-144"];
    expect(saved).toMatchObject({ attemptAt: new Date(NOW).toISOString(), doneAt: null });
  });
  it("erreur : notée, pas de boucle sur la même compétition dans le passage", async () => {
    state.detailResults["football.lineups"] = Promise.reject(new Error("API indisponible"));
    state.detailResults["football.lineups"].catch(() => {});
    state.db = seed({ competitions: [PRO], seasons: baseSeasons, plan: basePlan });
    const body = await tick();
    expect(detailRuns().filter(([key]) => key === "football.lineups")).toHaveLength(1);
    expect(body.details).toEqual([{ competition: "Pro League", ok: false, error: "API indisponible" }]);
  });
});
