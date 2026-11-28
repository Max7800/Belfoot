import { describe, expect, it } from "vitest";
import { auditSeasonCoverage } from "@/lib/seasonCoverage";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const base = {
  seasons: [{ id: "s", competition_id: "c", label: "2026-2027" }],
  competitions: [{ id: "c", ext: { coverage: { fixtures: { statistics_fixtures: false } } } }],
  schema_migrations: [{ module: "football", version: "0034_match_sync_state" }, { module: "football", version: "0035_match_team_stats" }],
  matches: [
    { id: "m1", season_id: "s", competition_id: "c", external_id: "1", status: "finished", kickoff: "2026-10-03", events_synced_at: "2026-10-04", lineups_synced_at: "2026-10-04", player_stats_synced_at: "2026-10-04" },
    { id: "m2", season_id: "s", competition_id: "c", external_id: "2", status: "finished", kickoff: "2026-10-02", events_synced_at: "2026-10-04", lineups_synced_at: null, player_stats_synced_at: "2026-10-04" },
    { id: "m3", season_id: "s", competition_id: "c", external_id: "3", status: "live", kickoff: "2026-10-05", events_synced_at: "2026-10-04" },
    { id: "other", season_id: "old", competition_id: "c", external_id: "4", status: "finished", kickoff: "2026-10-05", events_synced_at: "2026-10-04" },
  ],
  match_events: [{ id: "e1", match_id: "m1" }],
  match_lineups: [{ id: "l1", match_id: "m1" }],
  match_player_stats: [{ id: "p1", match_id: "m2" }],
};

describe("diagnostic des lignes enregistrées", () => {
  it("compare uniquement les matchs terminés marqués et omet les couvertures indisponibles", async () => {
    const db = createFakeSupabase(base);
    const result = await auditSeasonCoverage(db, "s");
    expect(result.sampleSize).toBe(2);
    expect(result.types).toEqual([
      { key: "events", label: "Événements", checked: 2, withoutRows: 1 },
      { key: "lineups", label: "Compositions", checked: 1, withoutRows: 0 },
      { key: "players", label: "Lignes joueurs", checked: 2, withoutRows: 1 },
    ]);
  });
  it("ne prétend pas qu'une migration absente permet une vérification", async () => {
    const db = createFakeSupabase({ ...base, schema_migrations: [] });
    expect(await auditSeasonCoverage(db, "s")).toEqual({ sampleSize: 0, types: [] });
  });
  it("limite l'échantillon aux dix matchs les plus récents", async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, season_id: "s", competition_id: "c", external_id: `${i}`, status: "finished", kickoff: `2026-10-${String(i + 1).padStart(2, "0")}`, events_synced_at: "2026-10-20" }));
    const db = createFakeSupabase({ ...base, matches: many, match_events: [] });
    const result = await auditSeasonCoverage(db, "s");
    expect(result.sampleSize).toBe(10);
    expect(result.types[0]).toMatchObject({ checked: 10, withoutRows: 10 });
  });
});
