-- Statistiques collectives par match (possession, tirs, passes, xG...).
-- Les lignes verrouillées manuellement ne sont jamais remplacées par le provider.

create table if not exists public.match_team_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  competition_id uuid references public.competitions(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  source text not null default 'manual',
  possession numeric,
  shots_total integer,
  shots_on_goal integer,
  shots_off_goal integer,
  shots_blocked integer,
  shots_inside_box integer,
  shots_outside_box integer,
  fouls integer,
  corners integer,
  offsides integer,
  yellow integer,
  red integer,
  goalkeeper_saves integer,
  passes_total integer,
  passes_accurate integer,
  pass_accuracy numeric,
  expected_goals numeric,
  locked boolean not null default false,
  synced_at timestamptz,
  ext jsonb not null default '{}',
  unique (match_id, club_id, source)
);

alter table public.matches
  add column if not exists team_stats_synced_at timestamptz;

create index if not exists match_team_stats_match
on public.match_team_stats (match_id, club_id);

create index if not exists matches_team_stats_sync_queue
on public.matches (competition_id, kickoff desc)
where status = 'finished' and external_id is not null and team_stats_synced_at is null;

alter table public.match_team_stats enable row level security;

drop policy if exists "match_team_stats_read" on public.match_team_stats;
drop policy if exists "match_team_stats_write" on public.match_team_stats;
create policy "match_team_stats_read" on public.match_team_stats
for select using (true);
create policy "match_team_stats_write" on public.match_team_stats
for all using (is_admin()) with check (is_admin());

create or replace function public.replace_provider_match_team_stats(
  target_match_id uuid,
  target_competition_id uuid,
  target_source text,
  stat_rows jsonb,
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
  if jsonb_typeof(coalesce(stat_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'stat_rows doit être un tableau JSON';
  end if;

  delete from public.match_team_stats
  where match_id = target_match_id
    and source = target_source
    and locked = false;

  insert into public.match_team_stats (
    match_id, competition_id, club_id, source,
    possession, shots_total, shots_on_goal, shots_off_goal, shots_blocked,
    shots_inside_box, shots_outside_box, fouls, corners, offsides,
    yellow, red, goalkeeper_saves, passes_total, passes_accurate,
    pass_accuracy, expected_goals, synced_at, ext
  )
  select
    target_match_id, target_competition_id, stat_row.club_id, target_source,
    stat_row.possession, stat_row.shots_total, stat_row.shots_on_goal,
    stat_row.shots_off_goal, stat_row.shots_blocked, stat_row.shots_inside_box,
    stat_row.shots_outside_box, stat_row.fouls, stat_row.corners,
    stat_row.offsides, stat_row.yellow, stat_row.red,
    stat_row.goalkeeper_saves, stat_row.passes_total, stat_row.passes_accurate,
    stat_row.pass_accuracy, stat_row.expected_goals, target_synced_at,
    coalesce(stat_row.ext, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(stat_rows, '[]'::jsonb)) as stat_row(
    club_id uuid,
    possession numeric,
    shots_total integer,
    shots_on_goal integer,
    shots_off_goal integer,
    shots_blocked integer,
    shots_inside_box integer,
    shots_outside_box integer,
    fouls integer,
    corners integer,
    offsides integer,
    yellow integer,
    red integer,
    goalkeeper_saves integer,
    passes_total integer,
    passes_accurate integer,
    pass_accuracy numeric,
    expected_goals numeric,
    ext jsonb
  )
  on conflict (match_id, club_id, source) do update set
    competition_id = excluded.competition_id,
    possession = excluded.possession,
    shots_total = excluded.shots_total,
    shots_on_goal = excluded.shots_on_goal,
    shots_off_goal = excluded.shots_off_goal,
    shots_blocked = excluded.shots_blocked,
    shots_inside_box = excluded.shots_inside_box,
    shots_outside_box = excluded.shots_outside_box,
    fouls = excluded.fouls,
    corners = excluded.corners,
    offsides = excluded.offsides,
    yellow = excluded.yellow,
    red = excluded.red,
    goalkeeper_saves = excluded.goalkeeper_saves,
    passes_total = excluded.passes_total,
    passes_accurate = excluded.passes_accurate,
    pass_accuracy = excluded.pass_accuracy,
    expected_goals = excluded.expected_goals,
    synced_at = excluded.synced_at,
    ext = excluded.ext
  where public.match_team_stats.locked = false;
  get diagnostics inserted_count = row_count;

  update public.matches
  set team_stats_synced_at = case when mark_complete then target_synced_at else team_stats_synced_at end
  where id = target_match_id;

  if not found then
    raise exception 'Match introuvable : %', target_match_id;
  end if;

  return inserted_count;
end;
$$;

revoke all on function public.replace_provider_match_team_stats(uuid, uuid, text, jsonb, timestamptz, boolean)
from public, anon, authenticated;
grant execute on function public.replace_provider_match_team_stats(uuid, uuid, text, jsonb, timestamptz, boolean)
to service_role;

insert into public.schema_migrations (module, version)
values ('football', '0035_match_team_stats')
on conflict do nothing;
