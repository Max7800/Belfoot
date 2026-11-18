import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

let db;
const team = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000099";
const ids = Array.from({ length: 12 }, (_, i) => `10000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`);
const observed = new Date().toISOString();
const roster = ids.slice(0, 11).map((playerId, i) => ({ playerId, sourceId: String(i + 1) }));
const apply = (time = observed) => db.query("select public.apply_rbfa_callups_atomic($1,$2,$3) as result", [team, "2026-2027", time]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table schema_migrations(module text,version text,primary key(module,version));
    create table clubs(id uuid primary key,source text,external_id text,team_type text);
    create table players(id uuid primary key);
    create table site_settings(id integer primary key,data jsonb);
    create table national_team_callups(id uuid primary key default gen_random_uuid(),national_team_id uuid,player_id uuid,season text,active boolean,source text,external_id text,position text,shirt_number integer,ext jsonb,locked boolean default false,synced_at timestamptz,updated_at timestamptz,unique(national_team_id,player_id,season));`);
  const sql = await readFile(new URL("../../modules/football/migrations/0043_rbfa_callups_atomic.sql", import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec(sql);
});
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("truncate national_team_rbfa_authority, national_team_callups, site_settings, players, clubs");
  await db.query("insert into clubs values ($1,'apifootball','1','national'),($2,'apifootball','1777','national')", [team, other]);
  for (const id of ids) await db.query("insert into players values ($1)", [id]);
  await db.query("insert into site_settings values (1,$1::jsonb)", [JSON.stringify({ football_rbfa_monitor: { senior: { observedAt: observed, players: roster } } })]);
});

describe("écriture atomique des convocations RBFA", () => {
  it("remplace les lignes API obsolètes et peut être rejouée", async () => {
    await db.query("insert into national_team_callups(national_team_id,player_id,season,active,source,locked) values ($1,$2,'2025-2026',true,'apifootball',false)", [team, ids[11]]);
    expect((await apply()).rows[0].result).toMatchObject({ players: 11, deactivated: 1 });
    expect((await apply()).rows[0].result).toMatchObject({ players: 11, deactivated: 0 });
    expect((await db.query("select count(*)::int as n from national_team_callups where active")).rows[0].n).toBe(11);
  });
  it("refuse une liste incomplète ou une observation remplacée sans aucune écriture", async () => {
    await expect(apply("ancien")).rejects.toThrow(/dépassée/);
    await db.query("update site_settings set data=$1::jsonb", [JSON.stringify({ football_rbfa_monitor: { senior: { observedAt: observed, players: roster.slice(0, 10) } } })]);
    await expect(apply()).rejects.toThrow(/incomplète/);
    expect((await db.query("select count(*)::int as n from national_team_callups")).rows[0].n).toBe(0);
  });
  it("refuse une observation trop ancienne même si elle est la dernière connue", async () => {
    const old = new Date(Date.now() - 3 * 3600000).toISOString();
    await db.query("update site_settings set data=$1::jsonb", [JSON.stringify({ football_rbfa_monitor: { senior: { observedAt: old, players: roster } } })]);
    await expect(apply(old)).rejects.toThrow(/trop ancienne/);
    expect((await db.query("select count(*)::int as n from national_team_callups")).rows[0].n).toBe(0);
  });
  it("refuse les ambiguïtés et les corrections manuelles contradictoires", async () => {
    await db.query("insert into national_team_callups(national_team_id,player_id,season,active,source,locked) values ($1,$2,'2026-2027',true,'manual',true)", [team, ids[11]]);
    await expect(apply()).rejects.toThrow(/verrouillées/);
    expect((await db.query("select count(*)::int as n from national_team_callups where active")).rows[0].n).toBe(1);
    await db.exec("truncate national_team_callups");
    await db.query("update site_settings set data=$1::jsonb", [JSON.stringify({ football_rbfa_monitor: { senior: { observedAt: observed, players: [...roster.slice(0, 10), roster[0]] } } })]);
    await expect(apply()).rejects.toThrow(/ambiguës/);
  });
  it("refuse les autres sélections et réserve la fonction au service", async () => {
    await expect(db.query("select public.apply_rbfa_callups_atomic($1,$2,$3)", [other, "2026-2027", observed])).rejects.toThrow(/non prise en charge/);
    const result = await db.query("select has_function_privilege('anon','public.apply_rbfa_callups_atomic(uuid,text,text)','EXECUTE') as anon, has_function_privilege('service_role','public.apply_rbfa_callups_atomic(uuid,text,text)','EXECUTE') as service");
    expect(result.rows[0]).toEqual({ anon: false, service: true });
  });
  it("annule toutes les écritures si une insertion échoue en cours de route", async () => {
    await db.query("insert into national_team_callups(national_team_id,player_id,season,active,source,locked) values ($1,$2,'2025-2026',true,'apifootball',false)", [team, ids[11]]);
    await db.exec(`create function test_reject_callup() returns trigger language plpgsql as $$ begin if new.player_id = '${ids[5]}'::uuid then raise exception 'échec simulé'; end if; return new; end $$;
      create trigger test_reject before insert on national_team_callups for each row execute function test_reject_callup();`);
    try {
      await expect(apply()).rejects.toThrow(/échec simulé/);
      const result = await db.query("select player_id,active from national_team_callups");
      expect(result.rows).toEqual([{ player_id: ids[11], active: true }]);
    } finally { await db.exec("drop trigger test_reject on national_team_callups; drop function test_reject_callup()"); }
  });
  it("la liste API ne réintroduit pas un ancien joueur après une liste RBFA", async () => {
    const api = [{ playerId: ids[11], externalId: "api-12", position: "Midfielder", number: 10 }];
    const apiCall = () => db.query("select public.apply_api_callups_atomic($1,$2,$3::jsonb) as result", [team, "2026-2027", JSON.stringify(api)]);
    expect((await apiCall()).rows[0].result).toMatchObject({ skipped: false, written: 1 });
    await apply();
    expect((await apiCall()).rows[0].result).toMatchObject({ skipped: true, reason: "rbfa_priority" });
    const rows = (await db.query("select player_id,active from national_team_callups where player_id=$1", [ids[11]])).rows;
    expect(rows).toEqual([{ player_id: ids[11], active: false }]);
    expect((await db.query("select count(*)::int as n from national_team_callups where active")).rows[0].n).toBe(11);
  });
  it("la liste API vide ne désactive rien et les lignes manuelles restent protégées", async () => {
    await db.query("insert into national_team_callups(national_team_id,player_id,season,active,source,locked) values ($1,$2,'2026-2027',true,'manual',true)", [team, ids[11]]);
    await expect(db.query("select public.apply_api_callups_atomic($1,$2,'[]'::jsonb)", [team, "2026-2027"])).rejects.toThrow(/vide/);
    const people = [{ playerId: ids[0], externalId: "api-1" }];
    await db.query("select public.apply_api_callups_atomic($1,$2,$3::jsonb)", [team, "2026-2027", JSON.stringify(people)]);
    expect((await db.query("select active,source from national_team_callups where player_id=$1", [ids[11]])).rows[0]).toEqual({ active: true, source: "manual" });
  });
  it("conserve la priorité RBFA même quand toutes les lignes sont manuelles", async () => {
    for (const id of ids.slice(0, 11)) await db.query("insert into national_team_callups(national_team_id,player_id,season,active,source,locked) values ($1,$2,'2026-2027',true,'manual',true)", [team, id]);
    expect((await apply()).rows[0].result).toMatchObject({ written: 0 });
    const api = [{ playerId: ids[11], externalId: "api-12" }];
    const result = await db.query("select public.apply_api_callups_atomic($1,$2,$3::jsonb) as result", [team, "2026-2027", JSON.stringify(api)]);
    expect(result.rows[0].result).toMatchObject({ skipped: true, reason: "rbfa_priority" });
  });
});
