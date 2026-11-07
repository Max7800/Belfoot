import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

let db;
const player = "00000000-0000-0000-0000-000000000001";
const monterrey = "00000000-0000-0000-0000-000000000002";
const chicago = "00000000-0000-0000-0000-000000000003";
const belgium = "00000000-0000-0000-0000-000000000004";
const current = "00000000-0000-0000-0000-000000000005";
const other = "00000000-0000-0000-0000-000000000006";
let year;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table clubs (id uuid primary key, team_type text);
    create table players (id uuid primary key, club_id uuid references clubs(id), name text);
    create table player_team_seasons (
      id uuid primary key, player_id uuid references players(id), club_id uuid references clubs(id),
      season text, season_start_year integer, active boolean, locked boolean, is_primary boolean
    );
    create table schema_migrations (module text, version text, primary key(module, version));
  `);
  const result = await db.query("select extract(year from timezone('UTC', now()))::int - case when extract(month from timezone('UTC', now())) < 7 then 1 else 0 end as y");
  year = result.rows[0].y;
  await db.query("insert into clubs values ($1,'first_team'),($2,'first_team'),($3,'national')", [monterrey, chicago, belgium]);
  await db.query("insert into players values ($1,$2,'Cuypers')", [player, monterrey]);
  await db.query("insert into player_team_seasons values ($1,$2,$3,$4,$5,true,true,true)", [current, player, monterrey, String(year), year]);
  const sql = await readFile(new URL("../../modules/football/migrations/0042_locked_player_club.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(sql);
});
afterAll(async () => { await db?.close(); });

describe("club verrouillé en PostgreSQL", () => {
  it("refuse de changer le club ou d'activer un concurrent", async () => {
    await expect(db.query("update players set club_id=$2 where id=$1", [player, chicago])).rejects.toThrow(/Club actuel protégé/);
    await expect(db.query("update players set club_id=null where id=$1", [player])).rejects.toThrow(/Club actuel protégé/);
    await expect(db.query("insert into player_team_seasons values ($1,$2,$3,$4,$5,true,false,true)", [other, player, chicago, String(year), year])).rejects.toThrow(/incompatible/);
    expect((await db.query("select club_id from players where id=$1", [player])).rows[0].club_id).toBe(monterrey);
  });
  it("autorise les statistiques, les sélections et l'historique", async () => {
    await db.query("update players set name='H. Cuypers' where id=$1", [player]);
    await db.query("insert into player_team_seasons values ($1,$2,$3,$4,$5,true,false,true)", [other, player, belgium, String(year), year]);
    await db.query("update player_team_seasons set club_id=$2,season_start_year=$3 where id=$1", [other, chicago, year - 1]);
    expect((await db.query("select count(*)::int as n from player_team_seasons")).rows[0].n).toBe(2);
  });
  it("un transfert éditorial devient possible après déverrouillage", async () => {
    await db.query("update player_team_seasons set locked=false,active=false where id=$1", [current]);
    await db.query("update players set club_id=$2 where id=$1", [player, chicago]);
    expect((await db.query("select club_id from players where id=$1", [player])).rows[0].club_id).toBe(chicago);
    await db.query("update player_team_seasons set season_start_year=$2,active=true where id=$1", [other, year]);
    await expect(db.query("update player_team_seasons set active=true,locked=true where id=$1", [current])).rejects.toThrow(/incompatible/);
  });
});
