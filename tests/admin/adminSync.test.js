import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { COMMON_PIPELINES, healthItems, historyRows, syncSections } from "@/lib/adminSync";
import { JOB_CATALOG, JOB_PIPELINES } from "@/lib/jobCatalog";

// Onglets « Synchronisations » et « Historique » rangés le 30/10/2026 (« mille boutons »).
const NOW = Date.parse("2026-10-30T10:00:00Z");
const minutesAgo = (minutes) => new Date(NOW - minutes * 60000).toISOString();

describe("rangement des actions", () => {
  const sections = syncSections();
  it("actions courantes : mise en place, compléter, mercato, balayage + campagne et vérification", () => {
    expect(sections.common.pipelines.map((p) => p.key)).toEqual(COMMON_PIPELINES);
    expect(sections.common.jobs).toEqual(["football.campaign-rollover", "football.league-check"]);
    expect(sections.catchup.map((p) => p.key)).toEqual(["belgian-careers", "belgian-season-stats", "careers-division"]);
  });
  it("chaque pipeline et chaque job a une seule place ; rien ne disparaît", () => {
    const placed = [...sections.common.pipelines, ...sections.catchup, ...sections.advanced.pipelines].map((p) => p.key);
    expect(placed.sort()).toEqual(JOB_PIPELINES.map((p) => p.key).sort());
    const jobs = [...sections.common.jobs, ...sections.advanced.jobs, ...sections.targeted];
    expect(new Set(jobs).size).toBe(jobs.length);
    for (const key of Object.keys(JOB_CATALOG)) {
      const reachable = jobs.includes(key) || JOB_PIPELINES.some((p) => p.jobs.includes(key));
      expect(reachable, key).toBe(true);
    }
  });
  it("découverte « monde » retirée (remplacée par le balayage des championnats)", () => {
    expect(JOB_PIPELINES.some((p) => p.key === "discover-world")).toBe(false);
    expect(JOB_CATALOG["football.discover-belgians"].scopes).toEqual(["competition"]);
  });
});

describe("santé des automatismes", () => {
  const data = {
    football_match_details_last: { at: minutesAgo(12), steps: 4, failed: 0 },
    football_competition_refresh_state: { a: minutesAgo(30), b: minutesAgo(3000) },
    football_abroad_follow_last: { at: minutesAgo(25), ok: true, detail: "Eredivisie : 3 match(s) de Belges" },
    football_abroad_follow_state: { scan: { leagueIndex: 4, cycleStartedAt: minutesAgo(600), cycleCompletedAt: null } },
    football_coach_refresh_state: { c: { checkedAt: minutesAgo(60 * 24 * 3) } },
  };
  const runs = [{ status: "ok", quota_remaining: 4200, started_at: minutesAgo(5), job_key: "football.lineups" }];
  it("tout va bien : statuts ok et textes lisibles", () => {
    const items = Object.fromEntries(healthItems(data, runs, NOW).map((item) => [item.key, item]));
    expect(items.details).toMatchObject({ status: "ok", detail: "4 lot(s), 0 échec(s) · il y a 12 min" });
    expect(items.results).toMatchObject({ status: "ok", detail: "dernière compétition mise à jour il y a 30 min" });
    expect(items.abroad.status).toBe("ok");
    expect(items.scan.detail).toBe("cycle en cours depuis 10 h (championnat n° 5)");
    expect(items.coaches.status).toBe("ok");
    expect(items.errors).toMatchObject({ status: "ok", detail: "aucune" });
    expect(items.quota).toMatchObject({ status: "ok", detail: "≈ 4200 appels aujourd'hui" });
  });
  it("retards, échecs et erreurs signalés", () => {
    const items = Object.fromEntries(healthItems({
      football_match_details_last: { at: minutesAgo(90), steps: 2, failed: 2 },
      football_abroad_follow_last: { at: minutesAgo(10), ok: false, skipped: "temps du passage épuisé" },
    }, [{ status: "error", job_key: "football.lineups", started_at: minutesAgo(60) }, { status: "ok", quota_remaining: 300, started_at: minutesAgo(70) }], NOW).map((item) => [item.key, item]));
    expect(items.details.status).toBe("error");
    expect(items.abroad.status).toBe("warn");
    expect(items.results.status).toBe("warn");
    expect(items.errors).toMatchObject({ status: "error", detail: "1 job(s) en erreur, dont 📋 Compositions & statistiques" });
    expect(items.quota.status).toBe("error");
    expect(healthItems({ football_match_details_last: { at: minutesAgo(60), steps: 3, failed: 0 } }, [], NOW)[0].status).toBe("warn");
  });
});

describe("historique lisible", () => {
  const runs = [
    { id: "1", job_key: "football.lineups", status: "ok", started_at: "2026-10-30T09:00:00Z", finished_at: "2026-10-30T09:00:07Z", request_count: 3, request_limit: 4, params: { competitionId: "c1" }, detail: "Pro League : 1 match" },
    { id: "2", job_key: "football.scan-belgians", status: "error", started_at: "2026-10-30T08:00:00Z", finished_at: "2026-10-30T08:01:05Z", request_count: 2, target_key: "global", detail: "fetch failed" },
  ];
  it("job en clair, compétition, appels, durée ; filtre des erreurs", () => {
    expect(historyRows(runs, { c1: { name: "Pro League" } })).toEqual([
      expect.objectContaining({ label: "📋 Compositions & statistiques", competition: "Pro League", calls: "3/4", duration: "7 s", status: "ok" }),
      expect.objectContaining({ label: "🇧🇪 Balayer les championnats", competition: "Tous", calls: "2", duration: "1 min 5 s", detail: "fetch failed" }),
    ]);
    expect(historyRows(runs, {}, { errorsOnly: true }).map((row) => row.id)).toEqual(["2"]);
  });
});

describe("administration : branchements", () => {
  const panels = fs.readFileSync("components/admin/panels.js", "utf8");
  it("« Historique » n'est plus un alias du panneau des jobs", () => {
    expect(panels).not.toContain("export const SyncHistoryPanel = JobsPanel;");
    expect(panels).toContain("export function SyncHistoryPanel() {");
    expect(panels).toContain("historyRows(runs, competitions, { errorsOnly })");
  });
  it("santé en tête, actions courantes, rattrapages et avancé repliés", () => {
    expect(panels).toContain("healthItems(settingsData, rows)");
    expect(panels).toContain('fold("catchup", "Rattrapages ponctuels"');
    expect(panels).toContain('fold("advanced", "Avancé"');
  });
});
