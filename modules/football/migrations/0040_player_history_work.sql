-- Progression distincte de players.ext : une synchronisation d'effectif peut
-- réécrire cet objet à partir d'un instantané antérieur. Saison 0 = parcours.
create table if not exists public.player_history_work (
  player_id uuid not null references public.players(id) on delete cascade,
  season integer not null check (season = 0 or season between 1900 and 2200),
  state text not null default 'pending' check (state in ('pending', 'running', 'done', 'error')),
  lease_token uuid,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (player_id, season)
);

alter table public.player_history_work enable row level security;
revoke all on table public.player_history_work from public, anon, authenticated;
grant select, insert, update, delete on table public.player_history_work to service_role;

-- Ne reprendre que les succès explicites : « error » et valeurs invalides ne
-- constituent pas une saison complète. ON CONFLICT permet une réexécution.
insert into public.player_history_work (player_id, season, state, completed_at)
select p.id, 0, 'done', p.career_synced_at
from public.players p
where p.career_sync_status = 'ok' and p.career_synced_at is not null
on conflict (player_id, season) do nothing;

insert into public.player_history_work (player_id, season, state, completed_at)
select p.id, (case when item.key ~ '^\d{4}$' then item.key::integer end), 'done', now()
from public.players p
cross join lateral jsonb_each_text(
  case when jsonb_typeof(p.ext->'career_stats_seasons') = 'object'
    then p.ext->'career_stats_seasons' else '{}'::jsonb end
) item
where (case when item.key ~ '^\d{4}$' then item.key::integer end) between 1900 and 2200
  and item.value ~ '^\d{4}-\d{2}-\d{2}'
on conflict (player_id, season) do nothing;

-- La prise de possession est un seul INSERT/UPDATE atomique. Un succès n'est
-- jamais réclamé ; une tâche abandonnée est récupérable après expiration.
create or replace function public.claim_player_history_work(p_player uuid, p_season integer, p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.player_history_work (player_id, season, state, lease_token, lease_expires_at, updated_at)
  values (p_player, p_season, 'running', p_token, now() + interval '5 minutes', now())
  on conflict (player_id, season) do update
    set state = 'running', lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at, last_error = null, updated_at = now()
    where player_history_work.state <> 'done'
      and (player_history_work.state <> 'running' or player_history_work.lease_expires_at <= now());
  return found;
end;
$$;

create or replace function public.finish_player_history_work(p_player uuid, p_season integer, p_token uuid, p_error text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.player_history_work
    set state = case when p_error is null then 'done' else 'error' end,
        completed_at = case when p_error is null then now() else null end,
        last_error = left(p_error, 500), lease_token = null, lease_expires_at = null, updated_at = now()
  where player_id = p_player and season = p_season and state = 'running'
    and lease_token = p_token and lease_expires_at > now();
  return found;
end;
$$;

revoke all on function public.claim_player_history_work(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.finish_player_history_work(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_player_history_work(uuid, integer, uuid) to service_role;
grant execute on function public.finish_player_history_work(uuid, integer, uuid, text) to service_role;

insert into public.schema_migrations (module, version)
values ('football', '0040_player_history_work') on conflict do nothing;
