#!/usr/bin/env bash
set -euo pipefail

# Base éphémère PostgreSQL du service CI : ne jamais pointer ce test vers la production.
if [[ "${PGDATABASE:-}" != "belfoot_test" || "${PGHOST:-}" != "localhost" ]]; then
  echo "Base de test locale requise" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 <<'SQL'
create role anon; create role authenticated; create role service_role;
create table schema_migrations(module text, version text, primary key(module, version));
create table clubs(id uuid primary key, source text, external_id text, team_type text);
create table players(id uuid primary key);
create table site_settings(id integer primary key, data jsonb);
create table national_team_callups(id uuid primary key default gen_random_uuid(), national_team_id uuid, player_id uuid, season text, active boolean, source text, external_id text, position text, shirt_number integer, ext jsonb, locked boolean default false, synced_at timestamptz, updated_at timestamptz, unique(national_team_id,player_id,season));
insert into clubs values ('00000000-0000-0000-0000-000000000001','apifootball','1','national');
insert into players select ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid from generate_series(1,12) n;
insert into site_settings select 1, jsonb_build_object('football_rbfa_monitor',jsonb_build_object('senior',jsonb_build_object('observedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'players',jsonb_agg(jsonb_build_object('sourceId',n::text,'playerId',('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))))))) from generate_series(1,11) n;
insert into national_team_callups(national_team_id,player_id,season,active,source,locked) values ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000012','2026-2027',true,'apifootball',false);
SQL
psql -v ON_ERROR_STOP=1 -f modules/football/migrations/0043_rbfa_callups_atomic.sql

outdir="$(mktemp -d)"
trap 'rm -rf "$outdir"' EXIT
# Transaction RBFA maintient le verrou avant de publier l'autorité.
psql -v ON_ERROR_STOP=1 >"$outdir/rbfa" 2>&1 <<'SQL' &
begin;
lock table national_team_callups in share row exclusive mode;
select pg_sleep(5);
select apply_rbfa_callups_atomic('00000000-0000-0000-0000-000000000001','2026-2027',(select data->'football_rbfa_monitor'->'senior'->>'observedAt' from site_settings where id=1));
commit;
SQL
rbfa_pid=$!
for attempt in {1..30}; do
  held="$(psql -Atc "select count(*) from pg_locks where relation='national_team_callups'::regclass and mode='ShareRowExclusiveLock' and granted")"
  if [[ "$held" -gt 0 ]]; then break; fi
  sleep 0.1
done
if [[ "${held:-0}" -eq 0 ]]; then echo "Verrou RBFA non acquis" >&2; exit 1; fi

# Un ancien worker démarre sa requête avant le commit RBFA et attend le verrou.
set +e
psql -v ON_ERROR_STOP=1 >"$outdir/legacy" 2>&1 <<'SQL'
update national_team_callups set active=true where player_id='10000000-0000-0000-0000-000000000012';
SQL
legacy_status=$?
set -e
if ! wait "$rbfa_pid"; then cat "$outdir/rbfa"; exit 1; fi
if [[ "$legacy_status" -eq 0 ]]; then echo "L'ancien worker a réactivé une convocation" >&2; cat "$outdir/legacy"; exit 1; fi
if ! grep -q "ancienne écriture API refusée" "$outdir/legacy"; then cat "$outdir/legacy"; exit 1; fi
active="$(psql -Atc "select count(*) from national_team_callups where active")"
if [[ "$active" != "11" ]]; then echo "Effectif incorrect : $active joueurs actifs" >&2; exit 1; fi
echo "Concurrence RBFA / ancien worker vérifiée."
