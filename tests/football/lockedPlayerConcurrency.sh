#!/usr/bin/env bash
set -euo pipefail
# Cette base jetable est créée uniquement sur le service PostgreSQL de la CI.
if [[ "${PGDATABASE:-}" != "belfoot_test" || "${PGHOST:-}" != "localhost" ]]; then
  echo "Base de test locale requise" >&2; exit 1
fi
createdb belfoot_locked_test
export PGDATABASE=belfoot_locked_test
psql -v ON_ERROR_STOP=1 <<'SQL'
create table public.clubs (id uuid primary key, team_type text);
create table public.players (id uuid primary key, club_id uuid references public.clubs(id));
create table public.player_team_seasons (id uuid primary key, player_id uuid references public.players(id), club_id uuid references public.clubs(id), season text, season_start_year integer, active boolean, locked boolean, is_primary boolean);
create table public.schema_migrations (module text, version text, primary key(module, version));
insert into public.clubs values ('00000000-0000-0000-0000-000000000001','first_team'),('00000000-0000-0000-0000-000000000002','first_team');
insert into public.players values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
SQL
psql -v ON_ERROR_STOP=1 -f modules/football/migrations/0046_locked_player_club.sql
outdir="$(mktemp -d)"
trap 'rm -rf "$outdir"' EXIT
PGAPPNAME=locked-writer psql -v ON_ERROR_STOP=1 >"$outdir/first" 2>&1 <<'SQL' &
begin;
insert into player_team_seasons values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',extract(year from timezone('UTC',now()))::int::text,(extract(year from timezone('UTC',now()))::int - case when extract(month from timezone('UTC',now())) < 7 then 1 else 0 end),true,true,true);
select pg_sleep(5);
commit;
SQL
first_pid=$!
for attempt in {1..40}; do
  held="$(psql -Atc "select count(*) from pg_stat_activity where application_name='locked-writer' and state='active' and query like '%pg_sleep%'")"
  [[ "$held" -gt 0 ]] && break
  sleep 0.1
done
if [[ "${held:-0}" -eq 0 ]]; then echo "Transaction protégée non démarrée" >&2; exit 1; fi
set +e
psql -v ON_ERROR_STOP=1 >"$outdir/second" 2>&1 <<'SQL'
insert into player_team_seasons values ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',extract(year from timezone('UTC',now()))::int::text,(extract(year from timezone('UTC',now()))::int - case when extract(month from timezone('UTC',now())) < 7 then 1 else 0 end),true,false,true);
SQL
second_status=$?
set -e
if ! wait "$first_pid"; then cat "$outdir/first"; exit 1; fi
if [[ "$second_status" -eq 0 ]]; then echo "Une affectation concurrente a été acceptée" >&2; exit 1; fi
if ! grep -q 'Affectation active incompatible' "$outdir/second"; then cat "$outdir/second"; exit 1; fi
count="$(psql -Atc 'select count(*) from player_team_seasons')"
[[ "$count" == 1 ]] || { echo "Nombre d’affectations incorrect : $count" >&2; exit 1; }
echo "Protection concurrente des clubs vérifiée."
