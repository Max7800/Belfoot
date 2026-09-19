-- 0002_session_competition.sql
-- Ajoute la compétition + la saison à une session « 11 de la semaine ».
-- Permet de choisir la JPL 2024, et la génération des éligibles lit les matchs
-- de (competition_id, season_id, matchday) dans `matches` + `match_player_stats`.
begin;

alter table votw_sessions
  add column if not exists competition_id uuid references competitions(id) on delete set null,
  add column if not exists season_id uuid references seasons(id) on delete set null;

create index if not exists votw_sessions_lookup
  on votw_sessions (competition_id, season_id, matchday);

insert into public.schema_migrations (module, version)
values ('votw', '0002_session_competition')
on conflict do nothing;

commit;
