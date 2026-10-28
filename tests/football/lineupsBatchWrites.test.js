import { describe, expect, it } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { syncLineups } from "@/modules/football/syncLineups";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// 28/10/2026 : les compositions prenaient 11 à 23 s par match (une écriture par
// joueur, plus une par convocation en sélection). Écritures désormais groupées.
const player = (team, id, extra = {}) => ({ team_ext: team, player_ext: id, player_name: `Joueur ${id}`, number: Number(id), position: "M", grid: null, starter: true, substitute: false, minutes: 90, rating: 7, ...extra });
function setup() {
  registerProvider({
    key: "batchprov",
    async fetchMatchLineups() { return [{ team_ext: "10", formation: "4-3-3", ext: {}, players: [player("10", "1"), player("10", "5")] }, { team_ext: "30", formation: "4-4-2", ext: {}, players: [player("30", "2"), player("30", "4")] }]; },
    async fetchMatchPlayerStats() { return [player("10", "1", { rating: 8.2 }), player("10", "5"), player("30", "2", { minutes: 70 }), player("30", "4"), player("10", "6", { starter: false, minutes: 0 })]; },
    async fetchMatchTeamStats() { return []; },
  });
  const db = createFakeSupabase({
    clubs: [{ id: "nat-be", source: "batchprov", external_id: "10", name: "Belgique", team_type: "national" }],
    players: [{ id: "p-1", source: "batchprov", external_id: "1", name: "Joueur 1" }, { id: "p-5", source: "batchprov", external_id: "5", name: "Joueur 5" }],
    seasons: [{ id: "s-1", competition_id: "comp-1", label: "2026-2027" }],
    matches: [{ id: "m-1", source: "batchprov", external_id: "700", competition_id: "comp-1", season_id: "s-1", status: "finished", kickoff: "2026-10-20T18:00:00+00:00" }],
    match_player_stats: [
      // Liens déjà résolus d'une synchro précédente : l'équipe 30 et le joueur 2 sont inconnus cette fois.
      { id: "old-2", match_id: "m-1", competition_id: "comp-1", source: "batchprov", player_external_id: "2", club_id: "club-30", player_id: "player-2", locked: false },
      { id: "locked-4", match_id: "m-1", competition_id: "comp-1", source: "batchprov", player_external_id: "4", minutes: 45, locked: true },
    ],
  });
  const writes = [];
  const from = db.from.bind(db);
  db.from = (table) => {
    const builder = from(table);
    const upsert = builder.upsert.bind(builder);
    builder.upsert = (payload, options) => { writes.push({ table, rows: Array.isArray(payload) ? payload.length : 1 }); return upsert(payload, options); };
    return builder;
  };
  return { db, writes };
}
const competition = { id: "comp-1", name: "Test", provider: "batchprov", external_id: "1", ext: {} };

describe("compositions : écritures groupées par match", () => {
  it("performances en un lot par forme de ligne, convocations en un seul lot (et non une écriture par joueur)", async () => {
    const { db, writes } = setup();
    await syncLineups(db, competition, { season: "2026-2027" });
    const stats = writes.filter((write) => write.table === "match_player_stats");
    expect(stats.length).toBe(3); // formes : club + joueur (1, 5), club seul (6), ni l'un ni l'autre (2)
    expect(stats.reduce((sum, write) => sum + write.rows, 0)).toBe(4); // 1, 5, 6, 2 — le 4 est verrouillé
    expect(writes.filter((write) => write.table === "national_match_callups")).toEqual([{ table: "national_match_callups", rows: 2 }]);
    expect(db.rows("national_match_callups").map((row) => row.player_id).sort()).toEqual(["p-1", "p-5"]);
  });
  it("liens « collants » : une ligne sans club ni joueur résolus n'efface pas ceux déjà enregistrés", async () => {
    const { db } = setup();
    await syncLineups(db, competition, { season: "2026-2027" });
    const byExternal = Object.fromEntries(db.rows("match_player_stats").map((row) => [row.player_external_id, row]));
    expect(byExternal["2"]).toMatchObject({ club_id: "club-30", player_id: "player-2", minutes: 70 });
    expect(byExternal["1"]).toMatchObject({ club_id: "nat-be", player_id: "p-1", rating: 8.2 });
    expect(byExternal["6"]).toMatchObject({ club_id: "nat-be", starter: false });
    expect(byExternal["6"].player_id).toBeUndefined();
    expect(byExternal["4"]).toMatchObject({ minutes: 45, locked: true }); // verrouillée : intacte
  });
});
