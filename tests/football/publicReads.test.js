import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readAll } from "@/lib/readAll";
import { loadMatchStatsForMatches, loadPlayerStatsForPlayers } from "@/lib/publicFootballData";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Le faux client reproduit le plafond silencieux de Supabase (maxRows).
const rowsOf = (count, extra = (index) => ({})) => Array.from({ length: count }, (_, index) => ({ id: `r${String(index).padStart(4, "0")}`, ...extra(index) }));

describe("readAll : lecture complète malgré le plafond silencieux", () => {
  it("plafond de 3 lignes, 8 lignes en base : les 8 sont lues, sans doublon, ordre stable", async () => {
    const db = createFakeSupabase({ matches: rowsOf(8, (i) => ({ competition_id: "c1", rank: 8 - i })) }, { maxRows: 3 });
    expect((await db.from("matches").select("*").eq("competition_id", "c1")).data).toHaveLength(3); // témoin : tronqué
    const { data, error } = await readAll(() => db.from("matches").select("*").eq("competition_id", "c1"), { pageSize: 3 });
    expect(error).toBeNull();
    expect(data.map((row) => row.id)).toEqual(rowsOf(8).map((row) => row.id));
  });
  it("ordre demandé conservé, id ajouté en dernier critère", async () => {
    const db = createFakeSupabase({ players: [{ id: "b", name: "Alpha" }, { id: "a", name: "Alpha" }, { id: "c", name: "Bravo" }] }, { maxRows: 2 });
    const { data } = await readAll(() => db.from("players").select("*").order("name"), { pageSize: 2 });
    expect(data.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });
  it("erreur : même forme que Supabase ({ data: null, error }) ; plafond de sécurité explicite", async () => {
    const failing = { order: () => failing, range: async () => ({ data: null, error: { message: "permission denied" } }) };
    expect(await readAll(() => failing)).toEqual({ data: null, error: { message: "permission denied" } });
    const endless = { order: () => endless, range: async () => ({ data: [{ id: 1 }, { id: 2 }], error: null }) };
    const guarded = await readAll(() => endless, { pageSize: 2, maxRows: 6 });
    expect(guarded.data).toBeNull();
    expect(guarded.error.message).toMatch(/plus de 6 lignes/);
  });
  it("lecteurs par paquets : toutes les performances et statistiques, même au-delà du plafond", async () => {
    const perfs = rowsOf(2500, (i) => ({ match_id: `m${i % 10}`, player_id: `p${i}` }));
    const stats = rowsOf(1200, (i) => ({ player_id: `p${i % 3}` }));
    const db = createFakeSupabase({ match_player_stats: perfs, player_season_stats: stats });
    expect(await loadMatchStatsForMatches(db, Array.from({ length: 10 }, (_, i) => `m${i}`))).toHaveLength(2500);
    expect(await loadPlayerStatsForPlayers(db, ["p0", "p1", "p2"])).toHaveLength(1200);
  });
});

describe("pages publiques : lectures des tables volumineuses toujours complètes", () => {
  const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith(".js") ? [path.join(dir, entry.name)] : []);
  const PUBLIC = [...files("app"), ...files("components/football"), "lib/publicFootballData.js", "lib/votw.js"].map((file) => file.replace(/\\/g, "/")).filter((file) => !file.startsWith("app/admin/") && !file.startsWith("app/api/"));
  // Lectures bornées par nature (une seule entité, une limite explicite) : autorisées.
  const BOUNDED = [/\.eq\("player_id", id\)/, /\.eq\("match_id", id\)/, /\.limit\(\d+\)/, /\.in\("player_id", ids\)/];
  it("player_team_seasons, player_season_stats, match_player_stats : readAll ou lecture bornée", () => {
    const offenders = [];
    for (const file of PUBLIC) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!/from\("(player_team_seasons|player_season_stats|match_player_stats)"\)/.test(line)) return;
        const context = [lines[index - 1] || "", line, lines[index + 1] || "", lines[index + 2] || ""].join(" ");
        if (/readAll\(/.test(context) || BOUNDED.some((pattern) => pattern.test(context))) return;
        offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
  it("lectures signalées par l'audit du 26/10 : toutes passées en lecture complète", () => {
    const read = (file) => fs.readFileSync(file, "utf8");
    const competition = read("app/competitions/[slug]/page.js");
    expect(competition).toContain("const statsResult = await readAll(() => {");
    expect(competition).toContain('const membershipResult = await readAll(() => supabase.from("player_team_seasons")');
    expect(read("app/competitions/page.js")).toContain('readAll(() => supabase.from("matches").select("id,competition_id,phase,round_raw")),');
    const club = read("app/clubs/[id]/page.js");
    expect(club).toContain('readAll(() => supabase.from("players").select("*").eq("club_id", id).order("name")),');
    expect(club).toContain('readAll(() => supabase.from("matches").select("*").eq("competition_id", contextMatch.competition_id).eq("season_id", contextMatch.season_id)),');
    expect(read("app/diables-rouges/page.js")).toContain('readAll(() => supabase.from("clubs").select(fields).eq("team_type", "national")),');
    expect(read("components/football/CompetitionTransfers.js")).toContain('const { data } = await readAll(() => supabase.from("player_transfers")');
  });
});
