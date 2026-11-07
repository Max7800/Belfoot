-- Protection transactionnelle du club actuel contre les écritures concurrentes.
-- Les écritures d'affectation prennent le verrou de la fiche joueur ; une
-- modification de players.club_id possède déjà ce verrou. Cela sérialise les
-- changements de club et d'affectation pour un même joueur.

create or replace function public.guard_locked_player_club()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  current_year integer := extract(year from timezone('UTC', now()))::integer
    - case when extract(month from timezone('UTC', now())) < 7 then 1 else 0 end;
begin
  if new.club_id is not distinct from old.club_id then
    return new;
  end if;
  if exists (
    select 1
    from public.player_team_seasons m
    join public.clubs c on c.id = m.club_id
    where m.player_id = new.id
      and m.season_start_year = current_year
      and m.active = true and m.locked = true and m.is_primary = true
      and coalesce(c.team_type, 'first_team') = 'first_team'
      and m.club_id is distinct from new.club_id
  ) then
    raise exception 'Club actuel protégé : déverrouiller son affectation avant de changer de club.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.guard_locked_player_membership()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  current_year integer := extract(year from timezone('UTC', now()))::integer
    - case when extract(month from timezone('UTC', now())) < 7 then 1 else 0 end;
  member_year integer;
  club_type text;
begin
  if tg_op = 'UPDATE' and new.player_id is distinct from old.player_id then
    raise exception 'Le joueur d’une affectation existante ne peut pas être changé.';
  end if;
  if tg_op = 'DELETE' then
    perform 1 from public.players where id = old.player_id for update;
    return old;
  end if;
  perform 1 from public.players where id = new.player_id for update;
  member_year := coalesce(new.season_start_year, nullif(substring(new.season from '[0-9]{4}'), '')::integer);
  if not new.active or not new.is_primary or member_year is distinct from current_year then
    return new;
  end if;
  select team_type into club_type from public.clubs where id = new.club_id;
  if coalesce(club_type, 'first_team') <> 'first_team' then return new; end if;
  if exists (
    select 1 from public.player_team_seasons m
    join public.clubs c on c.id = m.club_id
    where m.player_id = new.player_id
      and m.season_start_year = current_year
      and m.active = true and m.is_primary = true
      and (m.locked = true or new.locked = true)
      and coalesce(c.team_type, 'first_team') = 'first_team'
      and m.club_id <> new.club_id
      and m.id <> new.id
  ) then
    raise exception 'Affectation active incompatible avec un club protégé.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_locked_player_club on public.players;
create trigger guard_locked_player_club before update of club_id on public.players
for each row execute function public.guard_locked_player_club();

drop trigger if exists guard_locked_player_membership on public.player_team_seasons;
create trigger guard_locked_player_membership before insert or update or delete on public.player_team_seasons
for each row execute function public.guard_locked_player_membership();

insert into public.schema_migrations (module, version)
values ('football', '0042_locked_player_club') on conflict do nothing;
