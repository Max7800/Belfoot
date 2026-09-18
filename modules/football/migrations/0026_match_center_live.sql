begin;

-- Le direct reste désactivé par défaut : l'activation est un choix explicite
-- par compétition lorsque le forfait provider 2026 est prêt.
alter table public.competitions
  add column if not exists live_enabled boolean not null default false;

alter table public.competitions
  add column if not exists live_refresh_seconds integer not null default 60;

alter table public.competitions
  drop constraint if exists competitions_live_refresh_seconds_check;

alter table public.competitions
  add constraint competitions_live_refresh_seconds_check
  check (live_refresh_seconds between 30 and 900);

create index if not exists matches_live_status_kickoff_idx
  on public.matches (status, kickoff desc);

create index if not exists matches_live_competition_kickoff_idx
  on public.matches (competition_id, kickoff desc);

-- Les visiteurs écoutent uniquement les changements déjà écrits en base par
-- le job serveur. Realtime ne déclenche donc aucun appel API-Football.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_events'
  ) then
    alter publication supabase_realtime add table public.match_events;
  end if;
end $$;

insert into public.schema_migrations (module, version)
values ('football', '0026_match_center_live')
on conflict do nothing;

commit;
