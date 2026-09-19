-- 0029_national_fifa_ranking.sql
-- Classement FIFA administrable sur les sélections (clubs.team_type = 'national').
--
-- Conçu pour une future automatisation : API-Football (même en Pro) N'EXPOSE PAS le
-- classement FIFA — il viendra d'une source dédiée (Sportradar / BALLDONTLIE / Zyla /
-- Sportmonks…), branchée plus tard via un job `football.sync-fifa-rankings`.
--
-- Le manuel prime (même règle d'or que `locked`) : quand ce job existera, il ne
-- touchera QUE les lignes où `fifa_ranking is null` OU `fifa_ranking_source = 'auto'`,
-- et posera `fifa_ranking_source = 'auto'` + `fifa_ranking_at`. Une saisie admin
-- (valeur renseignée, source restée nulle) n'est donc jamais écrasée.
begin;

alter table public.clubs
  add column if not exists fifa_ranking int,
  add column if not exists fifa_ranking_source text,
  add column if not exists fifa_ranking_at timestamptz;

insert into public.schema_migrations (module, version)
values ('football', '0029_national_fifa_ranking')
on conflict do nothing;

commit;
