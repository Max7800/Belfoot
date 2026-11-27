import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

let db;
const team = "10000000-0000-0000-0000-000000000001";
const match = "20000000-0000-0000-0000-000000000001";
const player = "30000000-0000-0000-0000-000000000001";
const member = "40000000-0000-0000-0000-000000000001";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '${member}'::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table schema_migrations(module text,version text,primary key(module,version));
    create table clubs(id uuid primary key, team_type text, source text, external_id text);
    create table matches(id uuid primary key,home_club_id uuid,away_club_id uuid,status text,kickoff timestamptz);
    create table national_match_callups(match_id uuid,national_team_id uuid,player_id uuid,status text);
    create table player_ratings(match_id uuid,player_id uuid,member_id uuid,rating int);
    create table motm_votes(match_id uuid,player_id uuid,member_id uuid);
    alter table player_ratings enable row level security; alter table motm_votes enable row level security;
    grant select,insert,update,delete on player_ratings,motm_votes to authenticated;
    create function diable_ratings_open(mid uuid) returns boolean language sql stable as $$ select exists(select 1 from matches where id=mid and status='finished') $$;
    grant select on matches to authenticated; grant execute on function diable_ratings_open(uuid) to authenticated;`);
  const sql = await readFile(new URL("../../modules/football/migrations/0044_match_rating_eligibility.sql", import.meta.url), "utf8");
  await db.exec(sql); await db.exec(sql);
  await db.query("insert into clubs values ($1,'national','apifootball','1')", [team]);
  await db.query("insert into matches values ($1,$2,null,'finished',now())", [match, team]);
  await db.query("insert into national_match_callups values ($1,$2,$3,'started')", [match, team, player]);
});
afterAll(async () => { await db?.close(); });

describe("contrôle des notes en base", () => {
  it("accepte un joueur entré en jeu et refuse remplaçant, autre joueur ou autre rencontre", async () => {
    expect((await db.query("select diable_rating_player_eligible($1,$2) as ok", [match, player])).rows[0].ok).toBe(true);
    await db.exec("set role authenticated");
    await db.query("insert into player_ratings values ($1,$2,$3,7)", [match, player, member]);
    await expect(db.query("insert into motm_votes values ($1,$2,$3)", [match, "30000000-0000-0000-0000-000000000002", member])).rejects.toThrow(/row-level security/);
    await db.exec("reset role; update national_match_callups set status='bench'");
    expect((await db.query("select diable_rating_player_eligible($1,$2) as ok", [match, player])).rows[0].ok).toBe(false);
    await db.exec("set role authenticated");
    await expect(db.query("insert into motm_votes values ($1,$2,$3)", [match, player, member])).rejects.toThrow(/row-level security/);
    await db.exec("reset role");
  });
});
