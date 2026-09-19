begin;

-- Une sélection reste une équipe dans `clubs`, car les matchs référencent déjà
-- cette table. La catégorie permet de séparer Belgique A, U21, U19, U17, etc.
alter table public.clubs
  add column if not exists national_category text,
  add column if not exists national_gender text;

create index if not exists clubs_national_teams_idx
  on public.clubs (team_type, national_category, national_gender);

-- Une convocation ne remplace jamais le club courant du joueur. Cette table
-- relie la même personne à une sélection pour une saison donnée.
create table if not exists public.national_team_callups (
  id uuid primary key default gen_random_uuid(),
  national_team_id uuid not null references public.clubs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  season text not null,
  shirt_number integer,
  position text,
  active boolean not null default true,
  source text not null default 'manual',
  external_id text,
  ext jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (national_team_id, player_id, season)
);

create index if not exists national_team_callups_team_season_idx
  on public.national_team_callups (national_team_id, season, active);

create index if not exists national_team_callups_player_idx
  on public.national_team_callups (player_id, season desc);

alter table public.national_team_callups enable row level security;

drop policy if exists "national_team_callups_read" on public.national_team_callups;
drop policy if exists "national_team_callups_write" on public.national_team_callups;

create policy "national_team_callups_read"
  on public.national_team_callups for select using (true);

create policy "national_team_callups_write"
  on public.national_team_callups for all
  using (is_admin()) with check (is_admin());

insert into public.schema_migrations (module, version)
values ('football', '0027_national_teams')
on conflict do nothing;

commit;
