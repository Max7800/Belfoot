import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { detectNewCampaign, planWithCampaign, rolloverDue, rolloverEligibility } from "@/lib/campaignRollover";
import { assertImportTargetAllowed } from "@/lib/importPlan";
import { JOB_CATALOG } from "@/lib/jobCatalog";
import { registerProvider } from "@/modules/football/providers";
import rolloverJob from "@/modules/football/jobs/campaignRollover";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const U21 = { id: "c-850", name: "UEFA U21 Qualification", provider: "apifootball", source: "apifootball", external_id: "850", public_visible: true, competition_type: "hybrid", competition_scope: "international", ext: { providerType: "Cup", full_competition_seasons: { "2027-2028": "2026-10-18T09:40:30Z" } } };
const LEAGUE = (current) => ({ name: "UEFA U21", type: "Cup", seasons: [{ year: 2027, current: current === 2027 }, { year: 2029, current: current === 2029 }] });
const PLAN = { version: 4, seasons: [{ label: "2024-2025", enabled: false }, { label: "2025-2026", enabled: true }, { label: "2026-2027", enabled: true }, { label: "2027-2028", role: "added", enabled: true }], competitions: { "c-850": { enabled: true, expected_clubs: 52, expected_matches: 250, seasons: { "2027-2028": { enabled: true, scope: "base" } } }, "c-144": { enabled: true, seasons: {} } }, nationalTeams: {} };

describe("detectNewCampaign", () => {
  it("nouvelle saison « en cours » non importée : campagne à préparer (convention des libellés)", () => {
    expect(detectNewCampaign({ competition: U21, league: LEAGUE(2029) })).toEqual({ label: "2029-2030", year: "2029" });
  });
  it("campagne en cours déjà importée : rien à faire", () => {
    expect(detectNewCampaign({ competition: U21, league: LEAGUE(2027) })).toMatchObject({ upToDate: true, label: "2027-2028" });
  });
  it("aucune saison en cours ou année illisible : rien", () => {
    expect(detectNewCampaign({ competition: U21, league: LEAGUE(null) }).label).toBeUndefined();
    expect(detectNewCampaign({ competition: U21, league: { seasons: [{ year: "x", current: true }] } }).label).toBeUndefined();
    expect(detectNewCampaign({ competition: U21, league: null }).label).toBeUndefined();
  });
});

describe("rolloverEligibility", () => {
  it("suivie en entier, visible, autorisée : éligible", () => { expect(rolloverEligibility(U21, PLAN)).toBeNull(); });
  it("masquée, jamais importée en entier, non autorisée, désactivée ou hors API-Football : non", () => {
    expect(rolloverEligibility({ ...U21, public_visible: false }, PLAN)).toMatch(/masquée/);
    expect(rolloverEligibility({ ...U21, ext: {} }, PLAN)).toMatch(/jamais importée/);
    expect(rolloverEligibility(U21, { ...PLAN, competitions: { "c-850": { enabled: false } } })).toMatch(/non autorisée/);
    expect(rolloverEligibility(U21, { ...PLAN, competitions: { "c-850": { enabled: true, auto_rollover: false } } })).toMatch(/désactivé/);
    expect(rolloverEligibility({ ...U21, provider: "thesportsdb" }, PLAN)).toMatch(/fournisseur/);
  });
});

describe("planWithCampaign — autorisation pour CETTE compétition seulement", () => {
  it("saison ajoutée au plan, activée pour la compétition en « Archive résultats »", () => {
    const { plan, changed } = planWithCampaign(PLAN, "2029-2030", "c-850");
    expect(changed).toBe(true);
    expect(plan.seasons.at(-1)).toMatchObject({ label: "2029-2030", role: "added", enabled: true });
    expect(plan.competitions["c-850"].seasons["2029-2030"]).toEqual({ enabled: true, scope: "base", expected_clubs: 52, expected_matches: 250 });
    expect(plan.competitions["c-144"].seasons["2029-2030"]).toBeUndefined(); // aucune autre compétition autorisée
  });
  it("saison désactivée globalement par l'administrateur : jamais réactivée", () => {
    expect(planWithCampaign(PLAN, "2024-2025", "c-850").skip).toMatch(/désactivée dans le plan/);
  });
  it("déjà autorisée : niveau de l'administrateur conservé, rien à écrire", () => {
    const plan = { ...PLAN, competitions: { ...PLAN.competitions, "c-850": { ...PLAN.competitions["c-850"], seasons: { "2027-2028": { enabled: true, scope: "squads" } } } } };
    const result = planWithCampaign(plan, "2027-2028", "c-850");
    expect(result.changed).toBe(false);
    expect(result.plan.competitions["c-850"].seasons["2027-2028"].scope).toBe("squads");
  });
  it("plan ancien format, compétition non autorisée ou libellé invalide : refus", () => {
    expect(planWithCampaign({ version: 1 }, "2029-2030", "c-850").skip).toMatch(/ancien format/);
    expect(planWithCampaign(PLAN, "2029-2030", "inconnue").skip).toMatch(/non autorisée/);
    expect(planWithCampaign(PLAN, "2029", "c-850").skip).toMatch(/invalide/);
  });
});

describe("rolloverDue", () => {
  const NOW = Date.parse("2026-10-25T12:00:00Z");
  it("une vérification par jour et par compétition", () => {
    expect(rolloverDue(undefined, NOW)).toBe(true);
    expect(rolloverDue({ checkedAt: "2026-10-24T13:00:00Z" }, NOW)).toBe(false);
    expect(rolloverDue({ checkedAt: "2026-10-24T11:00:00Z" }, NOW)).toBe(true);
  });
});

// ── Job : de bout en bout sur un faux Supabase et un faux fournisseur ───────
describe("job football.campaign-rollover", () => {
  let calls;
  const fixture = (id, home, away) => ({ external_id: String(id), home_ext: home, away_ext: away, home_name: `${home} U21`, away_name: `${away} U21`, home_score: null, away_score: null, status: "scheduled", minute: null, round: "Group Stage - 1", kickoff: "2027-09-05T16:00:00Z" });
  beforeEach(() => {
    calls = [];
    registerProvider({
      key: "apifootball",
      async fetchLeagueSeasons() { calls.push("leagues"); return LEAGUE(2029); },
      async fetchMatches(_c, ctx) { calls.push(`fixtures:${ctx.season}`); return [fixture(1, "1", "2"), fixture(2, "2", "3")]; },
    });
  });
  const seed = (plan = PLAN, extra = {}) => createFakeSupabase({
    competitions: [{ ...U21, ...extra }],
    seasons: [{ id: "s-27", competition_id: "c-850", label: "2027-2028", import_status: "active", public_active: true }],
    site_settings: [{ id: 1, data: { football_import_plan: plan, autre: { garde: true } } }],
    schema_migrations: [["core", "0004_job_execution_guardrails"], ["football", "0023_season_safe_sync"], ["football", "0032_season_rollout"]].map(([module, version]) => ({ module, version })),
  });

  it("nouvelle campagne : plan, import, contrôles et « prête » — jamais activée", async () => {
    const db = seed();
    const detail = await rolloverJob.run({ db, competitionId: "c-850" });
    expect(calls).toEqual(["leagues", "fixtures:2029-2030"]);
    const season = db.rows("seasons").find((s) => s.label === "2029-2030");
    expect(season).toMatchObject({ import_status: "ready", public_active: false });
    expect(db.rows("seasons").find((s) => s.label === "2027-2028")).toMatchObject({ public_active: true }); // saison par défaut inchangée
    const settings = db.rows("site_settings")[0].data;
    expect(settings.football_import_plan.competitions["c-850"].seasons["2029-2030"]).toMatchObject({ enabled: true, scope: "base" });
    expect(settings.autre).toEqual({ garde: true });
    expect(db.rows("matches").filter((m) => m.season_id === season.id)).toHaveLength(2);
    expect(detail).toMatch(/PRÊTE/);
  });

  it("campagne déjà importée : un seul appel, aucune écriture", async () => {
    registerProvider({ key: "apifootball", async fetchLeagueSeasons() { calls.push("leagues"); return LEAGUE(2027); }, async fetchMatches() { calls.push("fixtures"); return []; } });
    const db = seed();
    const before = JSON.stringify(db.rows("site_settings"));
    expect(await rolloverJob.run({ db, competitionId: "c-850" })).toMatch(/déjà importée/);
    expect(calls).toEqual(["leagues"]);
    expect(JSON.stringify(db.rows("site_settings"))).toBe(before);
  });

  it("compétition non éligible : aucun appel API", async () => {
    const db = seed(PLAN, { public_visible: false });
    expect(await rolloverJob.run({ db, competitionId: "c-850" })).toMatch(/aucun appel API/);
    expect(calls).toEqual([]);
  });

  it("saison désactivée par l'administrateur : détectée mais non préparée, rien importé", async () => {
    const plan = { ...PLAN, seasons: [...PLAN.seasons, { label: "2029-2030", role: "added", enabled: false }] };
    const db = seed(plan);
    expect(await rolloverJob.run({ db, competitionId: "c-850" })).toMatch(/non préparée/);
    expect(calls).toEqual(["leagues"]);
    expect(db.rows("seasons").some((s) => s.label === "2029-2030")).toBe(false);
  });

  it("contrôles incomplets : importée mais pas marquée prête", async () => {
    registerProvider({ key: "apifootball", async fetchLeagueSeasons() { return LEAGUE(2029); }, async fetchMatches() { return []; } });
    const db = seed();
    expect(await rolloverJob.run({ db, competitionId: "c-850" })).toMatch(/contrôles incomplets/);
    expect(db.rows("seasons").find((s) => s.label === "2029-2030")?.import_status).not.toBe("ready");
  });

  it("garde d'import : compétition autorisée obligatoire", async () => {
    const entry = JOB_CATALOG["football.campaign-rollover"];
    await expect(assertImportTargetAllowed(seed(), "football.campaign-rollover", { competitionId: "c-850" }, entry)).resolves.toBeUndefined();
    await expect(assertImportTargetAllowed(seed(), "football.campaign-rollover", { competitionId: "c-144x" }, entry)).rejects.toThrow(/pas autorisée/);
    await expect(assertImportTargetAllowed(seed(), "football.campaign-rollover", {}, entry)).rejects.toThrow(/Choisis une compétition/);
  });
});

// ── Cron : une compétition par passage, une fois par jour, dans le budget ───
const cron = vi.hoisted(() => ({ db: null, runs: [], durationMs: 1000 }));
vi.mock("@/lib/supabaseAdmin", () => ({ getAdmin: () => cron.db }));
vi.mock("@/lib/jobs", () => ({ runJob: async (key, ctx) => { cron.runs.push({ key, competitionId: ctx.competitionId }); vi.setSystemTime(Date.now() + cron.durationMs); if (key === "football.campaign-rollover") return { detail: "campagne à jour" }; return key === "football.squads" ? { complete: true } : "ok"; } }));
const { GET } = await import("@/app/api/cron/competition-refresh/route");

describe("cron competition-refresh — passage de renouvellement", () => {
  const SECRET = "secret-de-test";
  const NOW = Date.parse("2026-10-25T12:00:00Z");
  const comps = ["a", "b"].map((id) => ({ id, name: `Comp ${id}`, provider: "apifootball", external_id: id, public_visible: true, competition_scope: "international" }));
  const plan = { version: 4, seasons: [{ label: "2026-2027", enabled: true }], competitions: { a: { enabled: true, seasons: { "2026-2027": { enabled: true, scope: "base" } } }, b: { enabled: true, seasons: { "2026-2027": { enabled: true, scope: "base" } } } } };
  const seedCron = (data = {}) => createFakeSupabase({ competitions: comps, seasons: comps.map((c) => ({ id: `s-${c.id}`, competition_id: c.id, label: "2026-2027", import_status: "active", public_active: true })), site_settings: [{ id: 1, data: { football_import_plan: plan, ...data } }] });
  const tick = async () => (await GET(new Request("http://localhost/api/cron/competition-refresh", { headers: { authorization: `Bearer ${SECRET}` } }))).json();
  const rollovers = () => cron.runs.filter((r) => r.key === "football.campaign-rollover").map((r) => r.competitionId);
  beforeAll(() => { process.env.CRON_SECRET = SECRET; vi.useFakeTimers({ toFake: ["Date"] }); });
  afterAll(() => { delete process.env.CRON_SECRET; vi.useRealTimers(); });
  beforeEach(() => { vi.setSystemTime(NOW); cron.runs = []; cron.durationMs = 1000; });

  it("une seule compétition vérifiée par passage, état mémorisé", async () => {
    cron.db = seedCron();
    const body = await tick();
    expect(rollovers()).toEqual(["a"]);
    expect(body.rollover).toMatchObject({ competition: "Comp a", ok: true });
    expect(cron.db.rows("site_settings")[0].data.football_campaign_rollover_state.a.checkedAt).toBe(new Date(NOW).toISOString());
  });

  it("au passage suivant, l'autre compétition ; puis plus rien avant 24 h", async () => {
    cron.db = seedCron({ football_campaign_rollover_state: { a: { checkedAt: new Date(NOW - 3600000).toISOString() } } });
    await tick();
    expect(rollovers()).toEqual(["b"]);
    cron.runs = [];
    vi.setSystemTime(NOW + 20 * 60000);
    await tick();
    expect(rollovers()).toEqual([]);
  });

  it("priorité à la vérification la plus ancienne", async () => {
    cron.db = seedCron({ football_campaign_rollover_state: { a: { checkedAt: new Date(NOW - 30 * 3600000).toISOString() }, b: { checkedAt: new Date(NOW - 50 * 3600000).toISOString() } } });
    await tick();
    expect(rollovers()).toEqual(["b"]);
  });

  it("budget de temps déjà entamé : pas de renouvellement dans ce passage", async () => {
    cron.durationMs = 8000; // deux synchros de 8 s : plus de marge pour un import supplémentaire
    cron.db = seedCron();
    await tick();
    expect(rollovers()).toEqual([]);
  });
});
