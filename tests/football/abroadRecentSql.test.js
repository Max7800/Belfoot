import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

let db;
const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create table schema_migrations (module text, version text, primary key(module,version));
    create table players (id uuid primary key, tracked boolean, active boolean);
    create table matches (id uuid primary key, kickoff timestamptz);
    create table clubs (id uuid primary key, team_type text);
    create table match_player_stats (id uuid primary key, match_id uuid, player_id uuid, club_id uuid, minutes int, goals int, assists int, rating numeric, synced_at timestamptz);`);
  await db.query("insert into players values ($1,true,true),($2,false,true)",[a,b]);
  await db.exec(`insert into matches select ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, now() - n * interval '1 day' from generate_series(1,7) n;
    insert into match_player_stats select ('20000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, '00000000-0000-0000-0000-000000000001', null, 90, n, 0, 7, now() - n * interval '1 day' from generate_series(1,7) n;`);
  const sql = await readFile(new URL("../../modules/football/migrations/0041_abroad_recent_performances.sql", import.meta.url), "utf8");
  await db.exec(sql); await db.exec(sql);
});
afterAll(async () => { await db?.close(); });
describe("performances récentes en PostgreSQL", () => {
  it("limite à cinq matchs par joueur selon la date de match, sans doublonner les identifiants", async () => {
    const r = await db.query("select * from abroad_recent_performances($1::uuid[])", [[a,a,b]]);
    expect(r.rows).toHaveLength(5);
    expect(r.rows.map((row) => row.goals)).toEqual([1,2,3,4,5]);
  });
  it("borne les demandes et reste security invoker", async () => {
    await expect(db.query("select * from abroad_recent_performances($1::uuid[])", [Array(81).fill(a)])).rejects.toThrow(/80 joueurs/);
    const r = await db.query("select prosecdef from pg_proc where oid = 'public.abroad_recent_performances(uuid[])'::regprocedure");
    expect(r.rows[0].prosecdef).toBe(false);
  });
  it("exclut les sélections et ne retient qu'une seule ligne par match", async () => {
    await db.exec(`insert into clubs values ('30000000-0000-0000-0000-000000000001','national');
      insert into matches values ('10000000-0000-0000-0000-000000000008',now());
      insert into match_player_stats values
        ('20000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',90,99,0,7,now()),
        ('20000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',null,90,42,0,7,now());`);
    const r = await db.query("select * from abroad_recent_performances($1::uuid[])", [[a]]);
    expect(r.rows.map((row) => row.goals)).toEqual([42,2,3,4,5]);
    expect(new Set(r.rows.map((row) => row.match_id)).size).toBe(5);
  });
  it("respecte les politiques de lecture du rôle appelant", async () => {
    await db.exec(`grant select on players,matches,clubs,match_player_stats to anon;
      alter table players enable row level security;
      create policy deny_players on players for select to anon using (false);
      set role anon;`);
    try {
      const r = await db.query("select * from abroad_recent_performances($1::uuid[])", [[a]]);
      expect(r.rows).toEqual([]);
    } finally { await db.exec("reset role"); }
  });
});
