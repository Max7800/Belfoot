import fs from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { detectNewCampaign, rolloverDue, rolloverEligibility, WAITING_RETRY_HOURS, watchedCompetitionIds } from "@/lib/campaignRollover";
import { hydrateCompetitionConfig } from "@/lib/importPlan";
import { buildSyncOverview } from "@/lib/syncOverview";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const H = 3600000;
const EURO_Q = { id: "c-960", name: "Euro Championship - Qualification", provider: "apifootball", external_id: "960", public_visible: false, ext: {} };
const planWith = (config) => ({ version: 4, seasons: [{ label: "2026-2027", enabled: true }], competitions: { "c-960": config } });

describe("règles de surveillance", () => {
  it("masquée et jamais importée : éligible si SURVEILLÉE et autorisée", () => {
    expect(rolloverEligibility(EURO_Q, planWith({ enabled: true, watch: true }))).toBeNull();
    expect(rolloverEligibility(EURO_Q, planWith({ enabled: true }))).toMatch(/^compétition masquée \(cocher « Surveiller »/);
    expect(rolloverEligibility(EURO_Q, planWith({ enabled: false, watch: true }))).toBe("compétition non autorisée dans le plan d'import");
    expect(rolloverEligibility(EURO_Q, planWith({ enabled: true, watch: true, auto_rollover: false }))).toMatch(/désactivé/);
    expect(rolloverEligibility({ ...EURO_Q, provider: "thesportsdb" }, planWith({ enabled: true, watch: true }))).toMatch(/fournisseur/);
  });
  it("visible non surveillée : exigence « importée en entier » inchangée", () => {
    expect(rolloverEligibility({ ...EURO_Q, public_visible: true }, planWith({ enabled: true }))).toBe("compétition jamais importée en entier");
  });
  it("campagne marquée importée mais SANS match : à réimporter (calendrier attendu)", () => {
    const competition = { ...EURO_Q, ext: { full_competition_seasons: { "2027-2028": "2026-12-01T00:00:00Z" } } };
    const league = { seasons: [{ year: 2027, current: true }] };
    expect(detectNewCampaign({ competition, league, importedMatches: 0 })).toEqual({ label: "2027-2028", year: "2027", refill: true });
    expect(detectNewCampaign({ competition, league, importedMatches: 12 })).toMatchObject({ upToDate: true });
    expect(detectNewCampaign({ competition, league })).toMatchObject({ upToDate: true }); // inconnu : comportement d'avant
  });
  it("calendrier attendu : nouvel essai tous les 3 jours au lieu de chaque jour", () => {
    const now = Date.parse("2026-12-10T12:00:00Z");
    expect(WAITING_RETRY_HOURS).toBe(72);
    expect(rolloverDue({ checkedAt: new Date(now - 30 * H).toISOString(), status: "waiting" }, now)).toBe(false);
    expect(rolloverDue({ checkedAt: new Date(now - 73 * H).toISOString(), status: "waiting" }, now)).toBe(true);
    expect(rolloverDue({ checkedAt: new Date(now - 25 * H).toISOString(), status: "ready" }, now)).toBe(true);
  });
  it("liste des surveillées : autorisées seulement", () => {
    expect(watchedCompetitionIds({ competitions: { a: { enabled: true, watch: true }, b: { enabled: false, watch: true }, c: { enabled: true } } })).toEqual(["a"]);
    expect(watchedCompetitionIds(null)).toEqual([]);
  });
  it("DÉFAUT CORRIGÉ : le plan conserve watch et auto_rollover à l'enregistrement", () => {
    const hydrated = hydrateCompetitionConfig({ id: "c-960", name: "Euro Q" }, { enabled: true, watch: true, auto_rollover: false, seasons: {} }, 0, { seasons: [{ label: "2026-2027", enabled: true }] });
    expect(hydrated).toMatchObject({ enabled: true, watch: true, auto_rollover: false });
    expect(hydrateCompetitionConfig({ id: "x", name: "X" }, { enabled: true }, 0, { seasons: [] })).not.toHaveProperty("watch");
  });
});

// ── Cron : les surveillées rejoignent le passage de renouvellement ──────────
const cron = vi.hoisted(() => ({ db: null, runs: [], reply: {} }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => cron.db }));
vi.mock("@/lib/jobs", () => ({ runJob: async (key, ctx) => { cron.runs.push({ key, competitionId: ctx.competitionId }); if (key === "football.campaign-rollover") return cron.reply[ctx.competitionId] || { detail: "à jour", meta: { status: "up-to-date" } }; return key === "football.squads" ? { complete: true } : "ok"; } }));
const { GET } = await import("@/app/api/cron/competition-refresh/route");
const SECRET = "secret-de-test";
const NOW = Date.parse("2026-12-10T12:00:00Z");
const tick = async () => (await GET(new Request("http://localhost/api/cron/competition-refresh", { headers: { authorization: `Bearer ${SECRET}` } }))).json();
const PRO = { id: "c-144", name: "Pro League", provider: "apifootball", external_id: "144", public_visible: true, competition_scope: "belgique", ext: { full_competition_seasons: { "2026-2027": "x" } } };
const cronPlan = { version: 4, seasons: [{ label: "2026-2027", enabled: true }], competitions: { "c-144": { enabled: true, seasons: { "2026-2027": { enabled: true, scope: "base" } } }, "c-960": { enabled: true, watch: true, seasons: {} } } };
const seedCron = ({ competitions = [PRO, EURO_Q], plan = cronPlan, rollover = {} } = {}) => createFakeSupabase({
  competitions: competitions.map((c) => ({ ...c })),
  seasons: [{ id: "s-pro", competition_id: "c-144", label: "2026-2027", import_status: "active", public_active: true }],
  site_settings: [{ id: 1, data: { football_import_plan: plan, football_competition_refresh_state: { "c-144": new Date(NOW - H).toISOString() }, football_campaign_rollover_state: rollover } }],
});
beforeAll(() => { process.env.CRON_SECRET = SECRET; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
afterAll(() => { delete process.env.CRON_SECRET; vi.useRealTimers(); });
beforeEach(() => { cron.runs = []; cron.reply = {}; });
const rolloverRuns = () => cron.runs.filter((run) => run.key === "football.campaign-rollover").map((run) => run.competitionId);
const state = () => cron.db.rows("site_settings")[0].data.football_campaign_rollover_state;

describe("cron competition-refresh — compétitions surveillées", () => {
  it("la surveillée masquée est vérifiée (la plus ancienne d'abord) ; statut et campagne enregistrés", async () => {
    cron.db = seedCron({ rollover: { "c-144": { checkedAt: new Date(NOW - 25 * H).toISOString(), ok: true } } });
    cron.reply["c-960"] = { detail: "Euro Q : en attente", meta: { status: "waiting", label: "2027-2028" } };
    await tick();
    expect(rolloverRuns()).toEqual(["c-960"]); // jamais vérifiée : passe avant la Pro League
    expect(state()["c-960"]).toMatchObject({ ok: true, status: "waiting", label: "2027-2028", detail: "Euro Q : en attente", checkedAt: new Date(NOW).toISOString() });
  });
  it("calendrier attendu : pas de nouvel essai avant 72 h", async () => {
    cron.db = seedCron({ rollover: { "c-144": { checkedAt: new Date(NOW - H).toISOString(), ok: true }, "c-960": { checkedAt: new Date(NOW - 30 * H).toISOString(), ok: true, status: "waiting" } } });
    await tick();
    expect(rolloverRuns()).toEqual([]);
  });
  it("surveillée non autorisée : jamais lancée", async () => {
    cron.db = seedCron({ plan: { ...cronPlan, competitions: { ...cronPlan.competitions, "c-960": { enabled: false, watch: true, seasons: {} } } }, rollover: { "c-144": { checkedAt: new Date(NOW - H).toISOString(), ok: true } } });
    await tick();
    expect(rolloverRuns()).toEqual([]);
  });
  it("aucune compétition visible à rafraîchir : la surveillance tourne quand même", async () => {
    cron.db = seedCron({ competitions: [EURO_Q] });
    const response = await tick();
    expect(response.skipped).toBeUndefined();
    expect(rolloverRuns()).toEqual(["c-960"]);
  });
});

describe("vue d'ensemble — compétitions surveillées", () => {
  const base = (rollover, seasons = []) => ({
    now: NOW,
    competitions: [{ ...EURO_Q }, { ...PRO }],
    seasons: [{ id: "s-pro", competition_id: "c-144", label: "2026-2027", import_status: "active", public_active: true }, ...seasons],
    settings: { football_import_plan: cronPlan, football_campaign_rollover_state: rollover, football_competition_refresh_state: { "c-144": new Date(NOW - H).toISOString() } },
    jobRuns: [], nationalTeams: [],
  });
  it("prête et non publiée : action « à publier »", async () => {
    const overview = await buildSyncOverview(base({ "c-960": { ok: true, status: "ready", label: "2027-2028", checkedAt: new Date(NOW).toISOString() } }, [{ id: "s-q", competition_id: "c-960", label: "2027-2028", import_status: "ready", public_active: false }]));
    expect(overview.watched).toMatchObject([{ id: "c-960", visible: false, enabled: true, readySeasons: ["2027-2028"] }]);
    expect(overview.alerts).toContainEqual({ level: "action", text: "Euro Championship - Qualification : nouvelle campagne 2027-2028 PRÊTE, compétition non publiée — à publier : la rendre visible (Admin → Compétitions), puis activer la saison (page Saisons)." });
    expect(overview.competitions.some((row) => row.id === "c-960")).toBe(false); // pas mélangée aux compétitions visibles
  });
  it("calendrier attendu : information ; contrôles incomplets : avertissement", async () => {
    const waiting = await buildSyncOverview(base({ "c-960": { ok: true, status: "waiting", label: "2027-2028" } }));
    expect(waiting.alerts).toContainEqual({ level: "info", text: "Euro Championship - Qualification : campagne 2027-2028 annoncée par l'API, calendrier pas encore publié (nouvel essai sous 72 h)." });
    const incomplete = await buildSyncOverview(base({ "c-960": { ok: true, status: "incomplete", label: "2027-2028" } }));
    expect(incomplete.alerts).toContainEqual({ level: "warning", text: "Euro Championship - Qualification : campagne 2027-2028 importée mais contrôles de publication incomplets." });
  });
  it("surveillée mais non autorisée : avertissement", async () => {
    const input = base({});
    input.settings.football_import_plan = { ...cronPlan, competitions: { ...cronPlan.competitions, "c-960": { enabled: false, watch: true } } };
    expect((await buildSyncOverview(input)).alerts).toContainEqual({ level: "warning", text: "Euro Championship - Qualification : surveillée mais non autorisée dans le plan d'import — la surveillance est inactive." });
  });
  it("compétition visible : l'état « incomplet » du renouvellement est aussi signalé", async () => {
    const overview = await buildSyncOverview(base({ "c-144": { ok: true, status: "incomplete", label: "2027-2028" } }));
    expect(overview.alerts).toContainEqual({ level: "warning", text: "Pro League : campagne 2027-2028 importée mais contrôles de publication incomplets." });
  });
  it("visible ET surveillée : listée parmi les surveillées, alertes non dupliquées", async () => {
    const input = base({ "c-144": { ok: true, status: "incomplete", label: "2027-2028" } });
    input.settings.football_import_plan = { ...cronPlan, competitions: { ...cronPlan.competitions, "c-144": { ...cronPlan.competitions["c-144"], watch: true } } };
    const overview = await buildSyncOverview(input);
    expect(overview.watched.map((row) => [row.id, row.visible])).toEqual([["c-960", false], ["c-144", true]]); // ordre alphabétique
    expect(overview.alerts.filter((alert) => alert.text.startsWith("Pro League : campagne 2027-2028"))).toHaveLength(1);
  });
});

describe("branchements", () => {
  const read = (file) => fs.readFileSync(file, "utf8");
  it("runJob transmet le résultat structuré du job (meta)", () => {
    expect(read("lib/jobs.js")).toContain("meta: outcome?.meta || null, detail: finalDetail");
  });
  it("plan d'import : case « Surveiller », inactive sans « Autoriser »", () => {
    const panel = read("components/admin/ImportPlanPanel.js");
    expect(panel).toContain("<input type=\"checkbox\" checked={config.watch === true && config.enabled} disabled={!config.enabled} onChange={(event) => updateCompetition(competition.id, { watch: event.target.checked })} />Surveiller</label>");
  });
  it("vue d'ensemble : section « Compétitions surveillées »", () => {
    expect(read("components/admin/SyncOverviewPanel.js")).toContain("Compétitions surveillées</h2>");
  });
});
