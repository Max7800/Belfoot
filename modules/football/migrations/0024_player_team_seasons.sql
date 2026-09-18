-- Un joueur est une personne. Son appartenance à un club varie selon la saison
-- et peut coexister avec une équipe U23/réserve ou un prêt.
create table if not exists public.player_team_seasons (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  season text not null,
  season_start_year integer,
  membership_type text not null default 'registered',
  squad_role text not null default 'first_team',
  is_primary boolean not null default true,
  active boolean not null default true,
  shirt_number integer,
  position text,
  joined_at date,
  left_at date,
  source text not null default 'manual',
  external_id text,
  ext jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_team_seasons_membership_type_check check (
    membership_type in ('registered', 'permanent', 'loan', 'youth', 'reserve', 'trial', 'legacy')
  ),
  constraint player_team_seasons_squad_role_check check (
    squad_role in ('first_team', 'reserve', 'u23', 'youth', 'women', 'unknown')
  ),
  constraint player_team_seasons_dates_check check (
    left_at is null or joined_at is null or left_at >= joined_at
  ),
  unique (player_id, club_id, season)
);

create index if not exists player_team_seasons_club_season
  on public.player_team_seasons (club_id, season, active);

create index if not exists player_team_seasons_player_season
  on public.player_team_seasons (player_id, season_start_year desc);

create or replace function public.set_player_team_season_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.season_start_year is null then
    new.season_start_year := nullif(substring(new.season from '[0-9]{4}'), '')::integer;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists player_team_seasons_metadata on public.player_team_seasons;
create trigger player_team_seasons_metadata
before insert or update on public.player_team_seasons
for each row execute function public.set_player_team_season_metadata();

alter table public.player_team_seasons enable row level security;

drop policy if exists "player_team_seasons_read" on public.player_team_seasons;
drop policy if exists "player_team_seasons_write" on public.player_team_seasons;

create policy "player_team_seasons_read"
  on public.player_team_seasons for select using (true);

create policy "player_team_seasons_write"
  on public.player_team_seasons for all
  using (is_admin()) with check (is_admin());

-- Les statistiques doivent aussi retenir le club représenté. C'est indispensable
-- pour un transfert en cours de saison et pour séparer équipe première et U23.
alter table public.player_season_stats
  add column if not exists club_id uuid references public.clubs(id) on delete set null,
  add column if not exists season_id uuid references public.seasons(id) on delete set null,
  add column if not exists ext jsonb not null default '{}'::jsonb,
  add column if not exists locked boolean not null default false;

update public.player_season_stats stats
set club_id = players.club_id
from public.players
where stats.player_id = players.id
  and stats.club_id is null
  and players.club_id is not null;

alter table public.player_season_stats
  drop constraint if exists player_season_stats_player_competition_season_key;

alter table public.player_season_stats
  drop constraint if exists player_season_stats_player_club_competition_season_key;

alter table public.player_season_stats
  add constraint player_season_stats_player_club_competition_season_key
  unique (player_id, club_id, competition_id, season);

create index if not exists player_season_stats_club_season
  on public.player_season_stats (club_id, season);

-- Backfill prudent : une affectation est créée à partir des statistiques réellement
-- présentes. On ne fabrique pas d'historique pour les saisons inconnues.
insert into public.player_team_seasons (
  player_id, club_id, season, season_start_year, membership_type,
  squad_role, is_primary, active, source, external_id, synced_at
)
select distinct on (stats.player_id, stats.club_id, stats.season)
  stats.player_id,
  stats.club_id,
  stats.season,
  nullif(substring(stats.season from '[0-9]{4}'), '')::integer,
  'registered',
  case when clubs.team_type in ('reserve', 'u23', 'youth', 'women') then clubs.team_type else 'first_team' end,
  clubs.team_type not in ('reserve', 'u23', 'youth', 'women'),
  true,
  coalesce(stats.source, players.source, 'manual'),
  stats.external_id,
  stats.synced_at
from public.player_season_stats stats
join public.players on players.id = stats.player_id
join public.clubs on clubs.id = stats.club_id
where stats.club_id is not null
  and stats.season is not null
on conflict (player_id, club_id, season) do nothing;

-- Relations belges connues. La mise à jour ne fait rien si l'une des deux fiches
-- n'existe pas, et reste entièrement modifiable depuis l'administration.
with known_links(child_names, parent_names, child_type) as (
  values
    (array['club nxt'], array['club brugge', 'club brugge kv'], 'u23'),
    (array['rsca futures', 'rsc anderlecht futures'], array['anderlecht', 'rsc anderlecht'], 'u23'),
    (array['jong genk'], array['genk', 'krc genk'], 'u23'),
    (array['jong kaa gent', 'kaa gent u23'], array['gent', 'kaa gent'], 'u23'),
    (array['sl16 fc', 'standard liège u23', 'standard liege u23'], array['standard liège', 'standard liege'], 'u23')
), resolved as (
  select child.id child_id, parent.id parent_id, links.child_type
  from known_links links
  join public.clubs child on lower(child.name) = any(links.child_names)
  join public.clubs parent on lower(parent.name) = any(links.parent_names)
)
update public.clubs clubs
set parent_club_id = resolved.parent_id,
    team_type = resolved.child_type
from resolved
where clubs.id = resolved.child_id
  and clubs.parent_club_id is null;

update public.player_team_seasons memberships
set squad_role = clubs.team_type,
    is_primary = false,
    updated_at = now()
from public.clubs
where memberships.club_id = clubs.id
  and clubs.team_type in ('reserve', 'u23', 'youth', 'women')
  and memberships.locked = false
  and memberships.source <> 'manual';

insert into public.schema_migrations (module, version)
values ('football', '0024_player_team_seasons')
on conflict do nothing;
