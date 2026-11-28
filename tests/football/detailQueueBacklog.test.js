import { describe, expect, it } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { syncEvents } from "@/modules/football/syncEvents";
import { syncLineups } from "@/modules/football/syncLineups";
import { loadPendingDetails } from "@/modules/football/detailQueue";
import { preflightJobs, requiredMigrationsForJob } from "@/lib/jobPreflight";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const season = "2026-2027";
const comp = { id: "c", name: "Test", provider: "backlog", external_id: "1", competition_type: "cup", ext: { coverage: { fixtures: { events: true, lineups: false, statistics_players: true, statistics_fixtures: false } } } };
const complete = { events_synced_at: "2026-11-20T00:00:00Z", player_stats_synced_at: "2026-11-20T00:00:00Z" };
function seed() {
  const matches = Array.from({ length: 501 }, (_, i) => ({ id: `new-${i}`, external_id: `new-${i}`, competition_id: "c", season_id: "s", status: "finished", kickoff: new Date(Date.UTC(2026, 10, 10, 0, i)).toISOString(), ...complete }));
  matches.push({ id: "old", external_id: "old", competition_id: "c", season_id: "s", status: "finished", kickoff: "2026-11-01T00:00:00Z", events_synced_at: null, player_stats_synced_at: null });
  const schema_migrations = [...new Map(["football.events", "football.lineups"].flatMap((key) => requiredMigrationsForJob(key, season)).map((m) => [`${m.module}:${m.version}`, m])).values()];
  return createFakeSupabase({ competitions: [comp], seasons: [{ id: "s", competition_id: "c", label: season }], matches, schema_migrations, site_settings: [{ id: 1, data: { football_import_plan: { version: 4, competitions: { c: { enabled: true, seasons: { [season]: { enabled: true, scope: "complete" } } } } } } }] });
}

describe("rattrapage au-delà des 500 matchs récents", () => {
  it("retrouve les événements en retard sans rappeler les matchs déjà traités", async () => {
    const called = [];
    registerProvider({ key: "backlog", async fetchEvents(match) { called.push(match.external_id); return []; } });
    const db = seed();
    const result = await syncEvents(db, comp, { season, drain: true, matchCap: 2 });
    expect(called).toEqual(["old"]);
    expect(result.complete).toBe(true);
  });
  it("retrouve les statistiques en retard au-delà des matchs déjà traités", async () => {
    const called = [];
    registerProvider({ key: "backlog", async fetchMatchPlayerStats(match) { called.push(match.external_id); return []; } });
    const db = seed();
    const result = await syncLineups(db, comp, { season, drain: true });
    expect(called).toEqual(["old"]);
    expect(result.complete).toBe(true);
    expect(db.rows("matches").find((m) => m.id === "old").player_stats_synced_at).toBeTruthy();
  });
  it.each([["football.events"], ["football.lineups"]])("le préflight %s estime l'appel et applique le quota", async (key) => {
    const db = seed();
    const input = { key, competitionId: "c", season, matchCap: 1, drain: true, requestLimit: 4 };
    expect((await preflightJobs(db, input)).total.max).toBe(1);
    await db.from("job_runs").insert({ quota_remaining: 0, finished_at: new Date().toISOString() });
    expect((await preflightJobs(db, input)).blockers.some((message) => message.includes("quota"))).toBe(true);
  });
  it("compte tous les matchs à reprendre mais ne renvoie qu'un lot borné", async () => {
    const db = seed();
    await db.from("matches").insert({ id: "old-2", external_id: "old-2", competition_id: "c", season_id: "s", status: "finished", kickoff: "2026-10-31T00:00:00Z", events_synced_at: null });
    const result = await loadPendingDetails(db, { competitionId: "c", seasonId: "s", kind: "events", limit: 1 });
    expect(result.count).toBe(2);
    expect(result.rows.map((row) => row.id)).toEqual(["old"]);
  });
});
