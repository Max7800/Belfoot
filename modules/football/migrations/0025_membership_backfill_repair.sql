begin;

-- Rattache les anciennes lignes de stats à la saison Belfoot correspondante.
with candidates as (
  select
    stats.id as stats_id,
    seasons.id as season_id,
    row_number() over (
      partition by stats.id
      order by (seasons.label = stats.season) desc, seasons.label
    ) as priority
  from public.player_season_stats stats
  join public.seasons seasons
    on seasons.competition_id = stats.competition_id
   and substring(seasons.label from '[0-9]{4}') = substring(stats.season from '[0-9]{4}')
  where stats.season_id is null
)
update public.player_season_stats stats
set season_id = candidates.season_id
from candidates
where stats.id = candidates.stats_id
  and candidates.priority = 1;

-- Une association héritée est considérée impossible si ce club n'a aucun match
-- dans cette compétition pendant la saison concernée. On retire seulement le
-- lien incertain ; les statistiques elles-mêmes sont conservées.
with invalid_stats as (
  select stats.id, stats.player_id, stats.club_id, stats.season
  from public.player_season_stats stats
  where stats.club_id is not null
    and nullif(substring(stats.season from '[0-9]{4}'), '') is not null
    and not exists (
      select 1
      from public.matches matches
      where matches.competition_id = stats.competition_id
        and (matches.home_club_id = stats.club_id or matches.away_club_id = stats.club_id)
        and matches.kickoff >= make_timestamptz(
          nullif(substring(stats.season from '[0-9]{4}'), '')::integer,
          7, 1, 0, 0, 0, 'UTC'
        )
        and matches.kickoff < make_timestamptz(
          nullif(substring(stats.season from '[0-9]{4}'), '')::integer + 1,
          7, 1, 0, 0, 0, 'UTC'
        )
    )
), unsupported_memberships as (
  select memberships.id
  from public.player_team_seasons memberships
  join invalid_stats invalid
    on invalid.player_id = memberships.player_id
   and invalid.club_id = memberships.club_id
   and substring(invalid.season from '[0-9]{4}') = substring(memberships.season from '[0-9]{4}')
  where memberships.locked = false
    and memberships.source <> 'manual'
    and not exists (
      select 1
      from public.player_season_stats supported
      where supported.player_id = memberships.player_id
        and supported.club_id = memberships.club_id
        and substring(supported.season from '[0-9]{4}') = substring(memberships.season from '[0-9]{4}')
        and supported.id not in (select id from invalid_stats)
    )
)
delete from public.player_team_seasons memberships
using unsupported_memberships unsupported
where memberships.id = unsupported.id;

with invalid_stats as (
  select stats.id
  from public.player_season_stats stats
  where stats.club_id is not null
    and nullif(substring(stats.season from '[0-9]{4}'), '') is not null
    and not exists (
      select 1
      from public.matches matches
      where matches.competition_id = stats.competition_id
        and (matches.home_club_id = stats.club_id or matches.away_club_id = stats.club_id)
        and matches.kickoff >= make_timestamptz(
          nullif(substring(stats.season from '[0-9]{4}'), '')::integer,
          7, 1, 0, 0, 0, 'UTC'
        )
        and matches.kickoff < make_timestamptz(
          nullif(substring(stats.season from '[0-9]{4}'), '')::integer + 1,
          7, 1, 0, 0, 0, 'UTC'
        )
    )
)
update public.player_season_stats stats
set club_id = null
from invalid_stats invalid
where stats.id = invalid.id;

-- Répare les relations parent/enfant connues, y compris une ancienne relation
-- inversée Club Brugge -> Club NXT.
with known_links(child_names, parent_names, child_type) as (
  values
    (array['club nxt'], array['club brugge', 'club brugge kv'], 'u23'),
    (array['rsca futures', 'rsc anderlecht futures'], array['anderlecht', 'rsc anderlecht'], 'u23'),
    (array['jong genk'], array['genk', 'krc genk'], 'u23'),
    (array['jong kaa gent', 'kaa gent u23'], array['gent', 'kaa gent'], 'u23'),
    (array['sl16 fc', 'standard liège u23', 'standard liege u23'], array['standard liège', 'standard liege'], 'u23')
), resolved as (
  select child.id child_id, parent.id parent_id
  from known_links links
  join public.clubs child on lower(child.name) = any(links.child_names)
  join public.clubs parent on lower(parent.name) = any(links.parent_names)
)
update public.clubs parent
set parent_club_id = null,
    team_type = 'first_team'
from resolved
where parent.id = resolved.parent_id
  and parent.parent_club_id = resolved.child_id;

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
update public.clubs child
set parent_club_id = resolved.parent_id,
    team_type = resolved.child_type
from resolved
where child.id = resolved.child_id;

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
values ('football', '0025_membership_backfill_repair')
on conflict do nothing;

commit;
