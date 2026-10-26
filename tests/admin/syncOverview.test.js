import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSyncOverview, currentSeasonLabel, loadSyncOverviewData } from "@/lib/syncOverview";
import { adminSections } from "@/config/admin";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const NOW = Date.parse("2026-10-25T12:00:00Z");
const hoursAgo = (hours) => new Date(NOW - hours * 3600000).toISOString();
const plan = {
  version: 4,
  seasons: [{ label: "2026-2027", enabled: true }, { label: "2027-2028", enabled: true, role: "added" }],
  competitions: {
    "c-pl": { enabled: true, seasons: { "2026-2027": { enabled: true, scope: "complete" } } },
    "c-u21": { enabled: true, seasons: { "2027-2028": { enabled: true, scope: "base" } } },
    "c-off": { enabled: true, seasons: { "2026-2027": { enabled: false, scope: "base" } } },
  },
  nationalTeams: { "1": { enabled: true, seasons: { "2026-2027": { enabled: true, scope: "base" } } }, "2": { enabled: false, seasons: {} } },
};
const base = () => ({
  now: NOW,
  competitions: [
    { id: "c-pl", name: "Pro League", provider: "apifootball", competition_scope: "belgique" },
    { id: "c-u21", name: "Euro U21", provider: "apifootball", competition_scope: "international" },
    { id: "c-off", name: "Challenger", provider: "apifootball", competition_scope: "belgique" },
    { id: "c-hidden", name: "Cachée", provider: "apifootball", public_visible: false },
    { id: "c-empty", name: "Sans saison", provider: "apifootball" },
  ],
  seasons: [
    { id: "s1", competition_id: "c-pl", label: "2026-2027", import_status: "active", public_active: true },
    { id: "s2", competition_id: "c-u21", label: "2027-2028", import_status: "active", public_active: true },
    { id: "s3", competition_id: "c-u21", label: "2025-2026", import_status: "ready", public_active: false },
    { id: "s4", competition_id: "c-off", label: "2026-2027", import_status: "active", public_active: true },
    { id: "s5", competition_id: "c-empty", label: "2026-2027", import_status: "draft", public_active: false },
  ],
  settings: {
    football_import_plan: plan,
    football_competition_refresh_state: { "c-pl": hoursAgo(3), "c-u21": hoursAgo(40) },
    football_competition_stats_state: { "c-pl": { lastStatsAt: hoursAgo(5), clubIndex: 0 } },
    football_campaign_rollover_state: { "c-u21": { checkedAt: hoursAgo(2), ok: false, error: "quota" } },
  },
  nationalTeams: [
    { id: "n1", name: "Belgique", external_id: 1, national_followed: true, synced_at: hoursAgo(2) },
    { id: "n2", name: "Red Flames", external_id: 2, national_followed: true, national_gender: "women", synced_at: null },
    { id: "n3", name: "Belgique U19", external_id: 3, national_followed: true, synced_at: hoursAgo(50) },
  ],
  jobRuns: [
    ...[1, 2, 3].map((index) => ({ id: `t${index}`, job_key: "football.sync", target_key: "c-u21", status: "timeout", started_at: hoursAgo(index), request_count: 4 })),
    { id: "ok1", job_key: "football.sync", target_key: "c-pl", status: "success", started_at: hoursAgo(1), request_count: 4, quota_remaining: 640 },
    { id: "old", job_key: "football.sync", target_key: "c-pl", status: "error", started_at: hoursAgo(30), request_count: 9, quota_remaining: 7000 },
  ],
});
const byId = (rows, id) => rows.find((row) => row.id === id);

describe("buildSyncOverview", () => {
  it("compétitions visibles avec saison rafraîchie, garde du plan identique au cron et retard", async () => {
    const overview = await buildSyncOverview(base());
    expect(overview.competitions.map((row) => row.name)).toEqual(["Challenger", "Euro U21", "Pro League", "Sans saison"]);
    expect(byId(overview.competitions, "c-hidden")).toBeUndefined();
    expect(byId(overview.competitions, "c-pl")).toMatchObject({ season: "2026-2027", allowed: true, status: "ok" });
    expect(byId(overview.competitions, "c-u21")).toMatchObject({ season: "2027-2028", allowed: true, status: "late", readySeasons: [] }); // 2025-2026 « prête » = archive consultable, pas à activer
    expect(byId(overview.competitions, "c-off")).toMatchObject({ allowed: false, status: "not-allowed" });
    expect(byId(overview.competitions, "c-empty")).toMatchObject({ season: null, status: "no-season" });
  });

  it("statistiques : clubs au niveau « Archive enrichie » seulement", async () => {
    const overview = await buildSyncOverview(base());
    expect(byId(overview.competitions, "c-pl").stats).toEqual({ lastStatsAt: hoursAgo(5), clubIndex: 0 });
    expect(byId(overview.competitions, "c-u21").stats).toBeNull(); // compétition internationale
    const complete = base();
    complete.settings.football_import_plan = { ...plan, competitions: { ...plan.competitions, "c-u21": { enabled: true, seasons: { "2027-2028": { enabled: true, scope: "complete" } } } } };
    expect(byId((await buildSyncOverview(complete)).competitions, "c-u21").stats).toBeNull(); // même au niveau complet
  });

  it("nouvelle saison prête, plus récente que la saison par défaut : à activer", async () => {
    const input = base();
    input.seasons.push({ id: "s7", competition_id: "c-pl", label: "2027-2028", import_status: "ready", public_active: false });
    const overview = await buildSyncOverview(input);
    expect(byId(overview.competitions, "c-pl")).toMatchObject({ season: "2026-2027", readySeasons: ["2027-2028"] });
    expect(overview.alerts).toContainEqual({ level: "action", text: "Pro League : nouvelle saison 2027-2028 prête (déjà consultable), à activer comme saison par défaut depuis la page Saisons." });
    expect(overview.alerts.some((alert) => alert.text.includes("2025-2026 prête"))).toBe(false); // archive U21
  });

  it("statistiques figées : jamais rafraîchies ou depuis plus de 7 jours ; lot en cours : pas d'alerte", async () => {
    const texts = async (statsState) => { const input = base(); input.settings.football_competition_stats_state = statsState; return (await buildSyncOverview(input)).alerts.map((alert) => alert.text); };
    expect(await texts({})).toContain("Pro League : statistiques joueurs jamais rafraîchies par le cron.");
    expect(await texts({ "c-pl": { lastStatsAt: hoursAgo(24 * 21), clubIndex: 0 } })).toContain("Pro League : statistiques joueurs non rafraîchies depuis 21 jours.");
    expect((await texts({ "c-pl": { lastStatsAt: hoursAgo(24 * 6), clubIndex: 0 } })).some((text) => text.includes("statistiques"))).toBe(false);
    expect((await texts({ "c-pl": { lastStatsAt: null, clubIndex: 6 } })).some((text) => text.includes("statistiques"))).toBe(false);
  });

  it("saison prête mais déjà publique : rien à activer", async () => {
    const input = base();
    input.seasons.push({ id: "s6", competition_id: "c-pl", label: "2027-2028", import_status: "ready", public_active: true });
    expect(byId((await buildSyncOverview(input)).competitions, "c-pl").readySeasons).toEqual([]);
  });

  it("le retard suit refresh_idle_hours (borné comme le cron)", async () => {
    const input = base();
    input.settings.football_competition_refresh_state["c-u21"] = hoursAgo(25); // 20 h + 6 h de marge
    expect(byId((await buildSyncOverview(input)).competitions, "c-u21").status).toBe("ok");
    input.settings.football_competition_refresh_state["c-u21"] = hoursAgo(27);
    expect(byId((await buildSyncOverview(input)).competitions, "c-u21").status).toBe("late");
    input.settings.football_competition_refresh = { refresh_idle_hours: 72 };
    expect(byId((await buildSyncOverview(input)).competitions, "c-u21").status).toBe("ok");
    input.settings.football_competition_refresh = { refresh_idle_hours: 500 }; // borné à 72 h
    input.settings.football_competition_refresh_state["c-u21"] = hoursAgo(79);
    expect(byId((await buildSyncOverview(input)).competitions, "c-u21").status).toBe("late");
  });

  it("sélections : non autorisée, jamais synchronisée, en retard ; amorçage hors plan autorisé", async () => {
    const overview = await buildSyncOverview(base());
    expect(byId(overview.nationalTeams, "n1")).toMatchObject({ allowed: true, status: "ok" });
    expect(byId(overview.nationalTeams, "n2")).toMatchObject({ allowed: false, status: "not-allowed" });
    expect(byId(overview.nationalTeams, "n3")).toMatchObject({ allowed: true, status: "late" }); // absente du plan : amorçage
  });

  it("jobs des 24 h : compteurs, dernier quota, échecs répétés", async () => {
    const overview = await buildSyncOverview(base());
    expect(overview.jobs).toMatchObject({ total: 4, calls: 16, latestQuota: 640, byStatus: { timeout: 3, success: 1 } });
    expect(overview.jobs.failures.map((run) => run.id)).toEqual(["t1", "t2", "t3"]);
    const texts = overview.alerts.map((alert) => alert.text);
    expect(texts).toContain("football.sync (c-u21) : 3 coupures en 24 h.");
    expect(texts).toContain("Quota API bas : 640 appels restants.");
    expect(texts).toContain("Euro U21 : dernier renouvellement de campagne en échec (quota).");
    expect(texts.some((text) => text.startsWith("Challenger : saison 2026-2027 non autorisée"))).toBe(true);
    expect(overview.alerts.map((alert) => alert.level)).toEqual([...overview.alerts.map((alert) => alert.level)].sort((a, b) => ["warning", "action", "info"].indexOf(a) - ["warning", "action", "info"].indexOf(b)));
  });

  it("deux erreurs seulement : pas d'alerte de répétition ; quota confortable : pas d'alerte", async () => {
    const input = base();
    input.jobRuns = input.jobRuns.filter((run) => run.id !== "t3").map((run) => (run.quota_remaining ? { ...run, quota_remaining: 5000 } : run));
    const texts = (await buildSyncOverview(input)).alerts.map((alert) => alert.text);
    expect(texts.some((text) => text.includes("coupures en 24 h"))).toBe(false);
    expect(texts.some((text) => text.startsWith("Quota API bas"))).toBe(false);
  });

  it("saison calendaire : juillet bascule", () => {
    expect(currentSeasonLabel(Date.parse("2026-06-30T12:00:00Z"))).toBe("2025-2026");
    expect(currentSeasonLabel(Date.parse("2026-07-01T00:00:00Z"))).toBe("2026-2027");
  });
});

describe("panneau en lecture seule", () => {
  it("le chargement ne fait que lire", async () => {
    const db = createFakeSupabase({
      competitions: [{ id: "c-pl", name: "Pro League", provider: "apifootball" }],
      seasons: [], job_runs: [], clubs: [{ id: "n1", name: "Belgique", team_type: "national", national_followed: true }],
      site_settings: [{ id: 1, data: { football_import_plan: plan } }],
    });
    const writes = [];
    const spy = { from: (table) => { const query = db.from(table); for (const method of ["insert", "update", "upsert", "delete"]) query[method] = () => { writes.push(`${table}.${method}`); return query; }; return query; } };
    const data = await loadSyncOverviewData(spy);
    expect(writes).toEqual([]);
    expect(data.competitions).toHaveLength(1);
    expect(data.nationalTeams).toHaveLength(1);
    expect(data.settings.football_import_plan).toEqual(plan);
  });

  it("aucun appel d'écriture, de job ou de route admin dans le code du panneau", () => {
    const code = fs.readFileSync("components/admin/SyncOverviewPanel.js", "utf8") + fs.readFileSync("lib/syncOverview.js", "utf8");
    expect(code).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    expect(code).not.toMatch(/fetch\(/);
    expect(code).not.toMatch(/runJob/);
  });

  it("enregistré dans le registre et dans le groupe Synchronisation", () => {
    const registry = fs.readFileSync("components/admin/registry.js", "utf8");
    expect(registry).toContain('import SyncOverviewPanel from "./SyncOverviewPanel";');
    expect(registry).toContain('if (key === "sync-overview") return { Comp: SyncOverviewPanel, props: {} };');
    const group = adminSections.find((section) => section.label === "Synchronisation");
    expect(group.panels[0]).toEqual({ key: "sync-overview", label: "Vue d'ensemble (lecture seule)" });
    expect(group.panels.some((panel) => panel.key === "sync-errors")).toBe(false); // ancien emplacement vide remplacé
  });
});
