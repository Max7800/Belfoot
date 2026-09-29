-- Niveaux de conservation par club et par saison.
-- La purge retire uniquement les détails provider du club ; elle conserve
-- toujours clubs, matchs, scores, événements, classements et joueurs.

create table if not exists public.club_season_coverage (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  coverage_level text not null default 'full',
  reason text,
  source text not null default 'manual',
  locked boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_season_coverage_level_check check (coverage_level in ('results', 'match', 'full')),
  unique (competition_id, season_id, club_id)
);

create index if not exists club_season_coverage_lookup
  on public.club_season_coverage (season_id, coverage_level, club_id);

alter table public.club_season_coverage enable row level security;
drop policy if exists "club_season_coverage_read" on public.club_season_coverage;
drop policy if exists "club_season_coverage_write" on public.club_season_coverage;
create policy "club_season_coverage_read" on public.club_season_coverage for select using (true);
create policy "club_season_coverage_write" on public.club_season_coverage for all
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.archive_secondary_club_data(
  target_season uuid,
  apply_changes boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_label text;
  candidate_clubs uuid[];
  target_matches uuid[];
  memberships_count integer := 0;
  lineups_count integer := 0;
  player_stats_count integer := 0;
  team_stats_count integer := 0;
  season_stats_count integer := 0;
begin
  if not public.is_admin() then raise exception 'Admin requis'; end if;

  select label into target_label from public.seasons where id = target_season;
  if target_label is null then raise exception 'Saison introuvable'; end if;

  select coalesce(array_agg(coverage.club_id), array[]::uuid[])
  into candidate_clubs
  from public.club_season_coverage coverage
  where coverage.season_id = target_season
    and coverage.coverage_level = 'results'
    and not exists (
      select 1
      from public.player_team_seasons membership
      join public.players player on player.id = membership.player_id
      where membership.club_id = coverage.club_id
        and membership.season = target_label
        and (player.tracked = true or player.national_team_id is not null)
    );

  select coalesce(array_agg(id), array[]::uuid[])
  into target_matches
  from public.matches
  where season_id = target_season;

  select count(*) into memberships_count
  from public.player_team_seasons membership
  where membership.season = target_label
    and membership.club_id = any(candidate_clubs)
    and membership.locked = false
    and membership.source <> 'manual'
    and not exists (select 1 from public.players player where player.id = membership.player_id and (player.tracked = true or player.national_team_id is not null));

  select count(*) into lineups_count from public.match_lineups
  where match_id = any(target_matches) and club_id = any(candidate_clubs) and locked = false and source <> 'manual';
  select count(*) into player_stats_count from public.match_player_stats stats
  where match_id = any(target_matches) and club_id = any(candidate_clubs) and locked = false and source <> 'manual'
    and not exists (select 1 from public.players player where player.id = stats.player_id and (player.tracked = true or player.national_team_id is not null));
  select count(*) into team_stats_count from public.match_team_stats
  where match_id = any(target_matches) and club_id = any(candidate_clubs) and locked = false and source <> 'manual';
  select count(*) into season_stats_count from public.player_season_stats stats
  where stats.season_id = target_season and stats.club_id = any(candidate_clubs) and stats.locked = false and stats.source <> 'manual'
    and not exists (select 1 from public.players player where player.id = stats.player_id and (player.tracked = true or player.national_team_id is not null));

  if apply_changes then
    update public.player_team_seasons membership set active = false, updated_at = now()
    where membership.season = target_label and membership.club_id = any(candidate_clubs)
      and membership.locked = false and membership.source <> 'manual'
      and not exists (select 1 from public.players player where player.id = membership.player_id and (player.tracked = true or player.national_team_id is not null));
    delete from public.match_lineups where match_id = any(target_matches) and club_id = any(candidate_clubs) and locked = false and source <> 'manual';
    delete from public.match_player_stats stats where match_id = any(target_matches) and club_id = any(candidate_clubs)
      and locked = false and source <> 'manual'
      and not exists (select 1 from public.players player where player.id = stats.player_id and (player.tracked = true or player.national_team_id is not null));
    delete from public.match_team_stats where match_id = any(target_matches) and club_id = any(candidate_clubs) and locked = false and source <> 'manual';
    delete from public.player_season_stats stats where stats.season_id = target_season and stats.club_id = any(candidate_clubs)
      and stats.locked = false and stats.source <> 'manual'
      and not exists (select 1 from public.players player where player.id = stats.player_id and (player.tracked = true or player.national_team_id is not null));
    update public.club_season_coverage set archived_at = now(), updated_at = now()
    where season_id = target_season and club_id = any(candidate_clubs) and coverage_level = 'results';
  end if;

  return jsonb_build_object(
    'applied', apply_changes,
    'clubs', cardinality(candidate_clubs),
    'memberships_archived', memberships_count,
    'lineups', lineups_count,
    'player_stats', player_stats_count,
    'team_stats', team_stats_count,
    'season_stats', season_stats_count,
    'detail_rows', lineups_count + player_stats_count + team_stats_count + season_stats_count
  );
end;
$$;

revoke all on function public.archive_secondary_club_data(uuid, boolean) from public;
grant execute on function public.archive_secondary_club_data(uuid, boolean) to authenticated;

insert into public.schema_migrations (module, version)
values ('football', '0039_data_retention')
on conflict do nothing;
