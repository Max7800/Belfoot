-- Mémorise aussi les réponses provider vides et remplace les événements dans
-- une transaction unique. Une correction manuelle (source != provider) n'est
-- jamais supprimée par la synchronisation.

alter table public.matches
  add column if not exists events_synced_at timestamptz,
  add column if not exists lineups_synced_at timestamptz,
  add column if not exists player_stats_synced_at timestamptz;

update public.matches as m
set events_synced_at = imported.synced_at
from (
  select match_id, max(created_at) as synced_at
  from public.match_events
  where source is not null and source <> 'manual'
  group by match_id
) as imported
where m.id = imported.match_id
  and m.events_synced_at is null;

update public.matches as m
set lineups_synced_at = imported.synced_at
from (
  select match_id, max(synced_at) as synced_at
  from public.match_lineups
  where source <> 'manual'
  group by match_id
) as imported
where m.id = imported.match_id
  and m.lineups_synced_at is null;

update public.matches as m
set player_stats_synced_at = imported.synced_at
from (
  select match_id, max(synced_at) as synced_at
  from public.match_player_stats
  where source <> 'manual' and minutes is not null
  group by match_id
) as imported
where m.id = imported.match_id
  and m.player_stats_synced_at is null;

create index if not exists matches_events_sync_queue
on public.matches (competition_id, kickoff desc)
where status = 'finished' and external_id is not null and events_synced_at is null;

create index if not exists matches_lineups_sync_queue
on public.matches (competition_id, kickoff desc)
where status = 'finished' and external_id is not null and lineups_synced_at is null;

create index if not exists matches_player_stats_sync_queue
on public.matches (competition_id, kickoff desc)
where status = 'finished' and external_id is not null and player_stats_synced_at is null;

create or replace function public.replace_provider_match_events(
  target_match_id uuid,
  target_source text,
  event_rows jsonb,
  target_synced_at timestamptz default now(),
  mark_complete boolean default true
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  if target_source is null or target_source = '' or target_source = 'manual' then
    raise exception 'Une source provider explicite est requise';
  end if;
  if jsonb_typeof(coalesce(event_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'event_rows doit être un tableau JSON';
  end if;

  delete from public.match_events
  where match_id = target_match_id and source = target_source;

  insert into public.match_events (
    match_id, minute, type, player_id, club_id, source,
    player_name, assist_name, detail
  )
  select
    target_match_id, event_row.minute, event_row.type, event_row.player_id, event_row.club_id,
    target_source, event_row.player_name, event_row.assist_name, event_row.detail
  from jsonb_to_recordset(coalesce(event_rows, '[]'::jsonb)) as event_row(
    minute integer,
    type text,
    player_id uuid,
    club_id uuid,
    player_name text,
    assist_name text,
    detail text
  );
  get diagnostics inserted_count = row_count;

  update public.matches
  set events_synced_at = case when mark_complete then target_synced_at else events_synced_at end
  where id = target_match_id;

  if not found then
    raise exception 'Match introuvable : %', target_match_id;
  end if;

  return inserted_count;
end;
$$;

revoke all on function public.replace_provider_match_events(uuid, text, jsonb, timestamptz, boolean)
from public, anon, authenticated;
grant execute on function public.replace_provider_match_events(uuid, text, jsonb, timestamptz, boolean)
to service_role;

insert into public.schema_migrations (module, version)
values ('football', '0034_match_sync_state')
on conflict do nothing;
