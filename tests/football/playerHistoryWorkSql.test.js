import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const player = "00000000-0000-0000-0000-000000000001";
const first = "00000000-0000-0000-0000-000000000010";
const second = "00000000-0000-0000-0000-000000000011";
let db;
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].ok;

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create table players (id uuid primary key, ext jsonb, career_synced_at timestamptz, career_sync_status text); create table schema_migrations (module text, version text, primary key (module,version));");
  await db.query("insert into players values ($1, $2::jsonb, now(), 'ok')", [player, JSON.stringify({ career_stats_seasons: { 2024: "2026-01-01T00:00:00Z", 2025: "error", garbage: "2026-01-01" } })]);
  const sql = await readFile(new URL("../../modules/football/migrations/0040_player_history_work.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(sql); // une migration rejouée ne détruit jamais la progression
});
afterAll(async () => { await db?.close(); });

describe("verrou et progression des historiques en PostgreSQL", () => {
  it("importe les seuls succès connus", async () => {
    const rows = (await db.query("select season,state from player_history_work order by season")).rows;
    expect(rows).toEqual([{ season: 0, state: "done" }, { season: 2024, state: "done" }]);
  });
  it("exclut une seconde exécution et récupère un bail expiré sans accepter l'ancien jeton", async () => {
    const claim = (token) => scalar("select claim_player_history_work($1,2025,$2) as ok", [player, token]);
    const finish = (token) => scalar("select finish_player_history_work($1,2025,$2) as ok", [player, token]);
    expect(await claim(first)).toBe(true);
    expect(await claim(second)).toBe(false);
    await db.exec("update player_history_work set lease_expires_at = now() - interval '1 second' where season = 2025");
    expect(await claim(second)).toBe(true);
    expect(await finish(first)).toBe(false);
    expect(await finish(second)).toBe(true);
    expect(await claim(first)).toBe(false);
  });
  it("ne donne pas accès aux utilisateurs anonymes ou authentifiés", async () => {
    expect(await scalar("select has_table_privilege('anon','public.player_history_work','SELECT') as ok")).toBe(false);
    expect(await scalar("select has_function_privilege('authenticated','public.claim_player_history_work(uuid,integer,uuid)','EXECUTE') as ok")).toBe(false);
    expect(await scalar("select has_function_privilege('service_role','public.claim_player_history_work(uuid,integer,uuid)','EXECUTE') as ok")).toBe(true);
  });
});
