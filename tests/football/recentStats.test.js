import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPlayerStatsForPlayers } from "@/lib/publicFootballData";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// 30/10/2026 : l'accueil et la page Belges lisaient les 5 saisons passées importées
// la veille pour n'afficher que la saison en cours.
const rows = [
  { id: "a", player_id: "p1", season: "2026-2027" }, { id: "b", player_id: "p1", season: "2026" },
  { id: "c", player_id: "p1", season: "2025-2026" }, { id: "d", player_id: "p1", season: "2025" }, { id: "e", player_id: "p2", season: "2021" },
];
describe("statistiques des saisons récentes seulement", () => {
  it("à partir de 2026 : 2026-2027 et la saison civile 2026 ; à partir de 2025 : aussi 2025 ; sans filtre : tout", async () => {
    const db = createFakeSupabase({ player_season_stats: rows });
    expect((await loadPlayerStatsForPlayers(db, ["p1", "p2"], { sinceSeason: 2026 })).map((row) => row.id).sort()).toEqual(["a", "b"]);
    expect((await loadPlayerStatsForPlayers(db, ["p1", "p2"], { sinceSeason: 2025 })).map((row) => row.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(await loadPlayerStatsForPlayers(db, ["p1", "p2"])).toHaveLength(5);
  });
  it("accueil : saison en cours, lue en même temps que les matchs ; page Belges : en cours et précédente", () => {
    const home = fs.readFileSync("app/page.js", "utf8");
    expect(home).toContain("{ sinceSeason: currentSeasonStart() }");
    expect(home).toContain("const [statsRows, ...carouselMatchResults] = await Promise.all([statsPromise,");
    expect(fs.readFileSync("app/belges-a-l-etranger/page.js", "utf8")).toContain("{ sinceSeason: currentSeasonStart() - 1 }");
  });
});
