import { describe, expect, it } from "vitest";
import { auditSeasonReadiness } from "@/lib/seasonReadiness";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const versions = [
  ["core", "0004_job_execution_guardrails"],
  ["football", "0023_season_safe_sync"],
  ["football", "0032_season_rollout"],
  ["football", "0024_player_team_seasons"],
  ["football", "0033_history_foundations"],
  ["football", "0034_match_sync_state"],
  ["football", "0035_match_team_stats"],
].map(([module, version]) => ({ module, version }));

function makeDb() {
  const matches = Array.from({ length: 1001 }, (_, index) => ({
    id: String(index).padStart(4, "0"), competition_id: "c", season_id: "s",
    external_id: String(index), status: "finished", home_club_id: "a", away_club_id: "b",
    events_synced_at: "2026-01-01", lineups_synced_at: "2026-01-01",
    player_stats_synced_at: "2026-01-01", team_stats_synced_at: "2026-01-01",
    ...(index === 1000 ? { lineups_synced_at: null, away_club_id: "c3" } : {}),
  }));
  return createFakeSupabase({
    seasons: [{ id: "s", competition_id: "c", label: "2026-2027" }],
    competitions: [{ id: "c", name: "Test", competition_type: "cup", provider: "api", ext: {} }],
    site_settings: [{ id: 1, data: { football_import_plan: { version: 4, competitions: { c: { enabled: true, seasons: { "2026-2027": { enabled: true, scope: "complete" } } } } } } }],
    schema_migrations: versions,
    matches,
    player_team_seasons: Array.from({ length: 33 }, (_, i) => ({ id: i, season_start_year: 2026, club_id: ["a", "b", "c3"][i % 3] })),
  });
}

describe("contrôle de saison sur toutes les pages", () => {
  it("détecte un match incomplet et une équipe après les 1 000 premiers matchs", async () => {
    const report = await auditSeasonReadiness(makeDb(), "s");
    expect(report.counts).toMatchObject({ matches: 1001, finished: 1001, clubs: 3, memberships: 33, pendingLineups: 1 });
    expect(report.checks.find((item) => item.key === "lineups")).toMatchObject({ ok: false });
    expect(report.checks.find((item) => item.key === "lineups").detail).toContain("réponse vide");
    expect(report.ok).toBe(false);
  });

  it("ne valide pas la saison si la lecture d'une page ultérieure échoue", async () => {
    const db = makeDb();
    const from = db.from.bind(db);
    const failure = new Error("page indisponible");
    db.from = (table) => {
      const query = from(table);
      if (table === "matches") {
        const range = query.range.bind(query);
        query.range = (first, last) => {
          range(first, last);
          if (first >= 1000) query.then = (resolve) => resolve({ data: null, error: failure });
          return query;
        };
      }
      return query;
    };
    await expect(auditSeasonReadiness(db, "s")).rejects.toBe(failure);
  });
});
