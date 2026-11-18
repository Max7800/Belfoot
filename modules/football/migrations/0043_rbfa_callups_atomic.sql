-- Préparation de l'écriture atomique : cette fonction n'est PAS appelée par
-- l'application tant que les imports API-Football ne sont pas coordonnés.
begin;

create table if not exists public.national_team_rbfa_authority (
  national_team_id uuid primary key references public.clubs(id) on delete cascade,
  observed_at timestamptz not null
);
alter table public.national_team_rbfa_authority enable row level security;
revoke all on table public.national_team_rbfa_authority from public, anon, authenticated;
grant select,insert,update,delete on table public.national_team_rbfa_authority to service_role;

create or replace function public.apply_rbfa_callups_atomic(p_team uuid, p_season text, p_observed_at text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  category text;
  snapshot jsonb;
  people jsonb;
  n integer;
  distinct_ids integer;
  distinct_source_ids integer;
  existing_players integer;
  conflicting integer;
  changed integer;
  removed integer;
begin
  if p_season is null or p_season !~ '^\d{4}-\d{4}$' or substring(p_season from 6 for 4)::integer <> substring(p_season from 1 for 4)::integer + 1 then
    raise exception 'Saison invalide';
  end if;
  select case external_id when '1' then 'senior' when '8183' then 'u21' end into category
    from public.clubs where id = p_team and source = 'apifootball' and team_type = 'national';
  if category is null then raise exception 'Sélection RBFA non prise en charge'; end if;

  -- Empêche toute écriture concurrente dans les convocations pendant la
  -- transaction, y compris celles des anciens imports non coopératifs.
  lock table public.national_team_callups in share row exclusive mode;
  select data -> 'football_rbfa_monitor' -> category into snapshot
    from public.site_settings where id = 1 for update;
  if p_observed_at is null or snapshot is null or snapshot->>'observedAt' is distinct from p_observed_at
      or snapshot->>'error' is not null or snapshot->>'linkError' is not null then
    raise exception 'Observation RBFA absente, dépassée ou en erreur';
  end if;
  if p_observed_at::timestamptz < now() - interval '2 hours' or p_observed_at::timestamptz > now() + interval '5 minutes' then
    raise exception 'Observation RBFA trop ancienne ou dans le futur';
  end if;
  people := snapshot->'players';
  if jsonb_typeof(people) is distinct from 'array' then raise exception 'Liste RBFA invalide'; end if;
  n := jsonb_array_length(people);
  if n < 11 or n > 60 then raise exception 'Liste RBFA incomplète'; end if;
  if exists (select 1 from jsonb_array_elements(people) r where
    coalesce(r->>'sourceId','') !~ '^\d+$' or
    coalesce(r->>'playerId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Identité RBFA non résolue';
  end if;
  select count(distinct r->>'playerId'), count(distinct r->>'sourceId') into distinct_ids, distinct_source_ids from jsonb_array_elements(people) r;
  if distinct_ids <> n or distinct_source_ids <> n then raise exception 'Identités RBFA ambiguës'; end if;
  select count(*) into existing_players from public.players p where p.id in (select (r->>'playerId')::uuid from jsonb_array_elements(people) r);
  if existing_players <> n then raise exception 'Fiche joueur introuvable'; end if;

  select count(*) into conflicting from public.national_team_callups c
    where c.national_team_id = p_team and (c.locked or c.source not in ('apifootball','rbfa'))
    and ((c.active and (c.season <> p_season or c.player_id not in (select (r->>'playerId')::uuid from jsonb_array_elements(people) r)))
      or (not c.active and c.season = p_season and c.player_id in (select (r->>'playerId')::uuid from jsonb_array_elements(people) r)));
  if conflicting > 0 then raise exception 'Convocations manuelles ou verrouillées en conflit'; end if;

  insert into public.national_team_callups (national_team_id,player_id,season,active,source,external_id,ext,locked,synced_at,updated_at)
  select p_team,(r->>'playerId')::uuid,p_season,true,'rbfa',r->>'sourceId',jsonb_build_object('rbfa_observed_at',p_observed_at),false,now(),now()
    from jsonb_array_elements(people) r
  on conflict (national_team_id,player_id,season) do update
    set active=true, source='rbfa', external_id=excluded.external_id,
        ext=coalesce(national_team_callups.ext,'{}'::jsonb) || excluded.ext, synced_at=now(),updated_at=now()
    where not national_team_callups.locked and national_team_callups.source in ('apifootball','rbfa');
  get diagnostics changed = row_count;
  update public.national_team_callups c set active=false,updated_at=now()
    where c.national_team_id=p_team and c.active and not c.locked and c.source in ('apifootball','rbfa')
      and (c.season <> p_season or c.player_id not in (select (r->>'playerId')::uuid from jsonb_array_elements(people) r));
  get diagnostics removed = row_count;
  insert into public.national_team_rbfa_authority(national_team_id,observed_at) values (p_team,p_observed_at::timestamptz)
    on conflict (national_team_id) do update set observed_at=excluded.observed_at;
  return jsonb_build_object('players',n,'written',changed,'deactivated',removed);
end;
$$;

-- Les futurs imports API doivent aussi passer par cette fonction avant que
-- l'écriture RBFA soit activée. Le verrou partagé sérialise les deux sources.
create or replace function public.apply_api_callups_atomic(p_team uuid, p_season text, p_people jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n integer;
  changed integer;
  removed integer;
begin
  if p_season is null or p_season !~ '^\d{4}-\d{4}$' or substring(p_season from 6 for 4)::integer <> substring(p_season from 1 for 4)::integer + 1 then raise exception 'Saison invalide'; end if;
  if not exists (select 1 from public.clubs where id=p_team and team_type='national') then raise exception 'Sélection introuvable'; end if;
  if jsonb_typeof(p_people) is distinct from 'array' then raise exception 'Liste API invalide'; end if;
  n := jsonb_array_length(p_people);
  if n < 1 or n > 100 then raise exception 'Liste API vide ou trop volumineuse'; end if;
  if exists (select 1 from jsonb_array_elements(p_people) r where coalesce(r->>'playerId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or coalesce(r->>'externalId','') = '') then raise exception 'Identité API invalide'; end if;
  if (select count(distinct r->>'playerId') from jsonb_array_elements(p_people) r) <> n then raise exception 'Identités API dupliquées'; end if;
  if (select count(*) from public.players p where p.id in (select (r->>'playerId')::uuid from jsonb_array_elements(p_people) r)) <> n then raise exception 'Fiche joueur introuvable'; end if;
  lock table public.national_team_callups in share row exclusive mode;
  -- Une liste RBFA appliquée reste prioritaire même si l'API est en retard.
  if exists (select 1 from public.national_team_rbfa_authority where national_team_id=p_team) then
    return jsonb_build_object('skipped',true,'reason','rbfa_priority');
  end if;
  insert into public.national_team_callups (national_team_id,player_id,season,active,source,external_id,position,shirt_number,ext,locked,synced_at,updated_at)
  select p_team,(r->>'playerId')::uuid,p_season,true,'apifootball',r->>'externalId',r->>'position',nullif(r->>'number','')::integer,coalesce(r->'ext','{}'::jsonb),false,now(),now()
    from jsonb_array_elements(p_people) r
  on conflict (national_team_id,player_id,season) do update set
    active=true, external_id=excluded.external_id,position=excluded.position,shirt_number=excluded.shirt_number,
    ext=excluded.ext,synced_at=now(),updated_at=now()
    where not national_team_callups.locked and national_team_callups.source='apifootball';
  get diagnostics changed = row_count;
  update public.national_team_callups c set active=false,updated_at=now()
    where c.national_team_id=p_team and c.active and not c.locked and c.source='apifootball'
      and (c.season <> p_season or c.player_id not in (select (r->>'playerId')::uuid from jsonb_array_elements(p_people) r));
  get diagnostics removed = row_count;
  return jsonb_build_object('skipped',false,'written',changed,'deactivated',removed);
end;
$$;

revoke all on function public.apply_rbfa_callups_atomic(uuid,text,text) from public, anon, authenticated;
grant execute on function public.apply_rbfa_callups_atomic(uuid,text,text) to service_role;
revoke all on function public.apply_api_callups_atomic(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.apply_api_callups_atomic(uuid,text,jsonb) to service_role;
insert into public.schema_migrations (module,version) values ('football','0043_rbfa_callups_atomic') on conflict do nothing;
commit;
