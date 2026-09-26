-- Historiques importés par lots et convocations propres à chaque match.
-- Les lignes verrouillées manuellement restent toujours prioritaires.

alter table public.players
  add column if not exists career_sync_status text not null default 'pending',
  add column if not exists career_synced_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'players_career_sync_status_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players add constraint players_career_sync_status_check
      check (career_sync_status in ('pending', 'running', 'ok', 'error'));
  end if;
end $$;

create index if not exists players_career_sync_queue
on public.players (career_sync_status, career_synced_at, id)
where tracked = true and active = true;

create index if not exists clubs_parent_team_type
on public.clubs (parent_club_id, team_type);

create table if not exists public.national_match_callups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  national_team_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  status text not null default 'called_up'
    check (status in ('called_up', 'started', 'bench', 'played', 'unavailable')),
  shirt_number integer,
  position text,
  source text not null default 'manual',
  external_id text,
  ext jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index if not exists national_match_callups_match
on public.national_match_callups (match_id, national_team_id, status);

alter table public.national_match_callups enable row level security;

drop policy if exists "national_match_callups_read" on public.national_match_callups;
drop policy if exists "national_match_callups_write" on public.national_match_callups;
create policy "national_match_callups_read" on public.national_match_callups
  for select using (true);
create policy "national_match_callups_write" on public.national_match_callups
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.schema_migrations (module, version)
values ('football', '0033_history_foundations')
on conflict do nothing;
