-- Une note concerne un joueur ayant participé au match de la Belgique A.
-- Les votes historiques sont conservés ; seules les nouvelles écritures sont contrôlées.
begin;
create or replace function public.diable_rating_player_eligible(mid uuid, pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.national_match_callups c
    join public.clubs t on t.id = c.national_team_id
    join public.matches m on m.id = c.match_id
    where c.match_id = mid and c.player_id = pid
      and c.status in ('started', 'played')
      and t.team_type = 'national' and t.source = 'apifootball' and t.external_id = '1'
      and (m.home_club_id = t.id or m.away_club_id = t.id)
  );
$$;
revoke all on function public.diable_rating_player_eligible(uuid,uuid) from public;
grant execute on function public.diable_rating_player_eligible(uuid,uuid) to authenticated;

drop policy if exists "prat_insert" on public.player_ratings;
drop policy if exists "prat_update" on public.player_ratings;
create policy "prat_insert" on public.player_ratings for insert to authenticated
  with check (member_id = auth.uid() and public.diable_ratings_open(match_id) and public.diable_rating_player_eligible(match_id, player_id));
create policy "prat_update" on public.player_ratings for update to authenticated
  using (member_id = auth.uid() and public.diable_ratings_open(match_id))
  with check (member_id = auth.uid() and public.diable_ratings_open(match_id) and public.diable_rating_player_eligible(match_id, player_id));
drop policy if exists "motm_insert" on public.motm_votes;
drop policy if exists "motm_update" on public.motm_votes;
create policy "motm_insert" on public.motm_votes for insert to authenticated
  with check (member_id = auth.uid() and public.diable_ratings_open(match_id) and public.diable_rating_player_eligible(match_id, player_id));
create policy "motm_update" on public.motm_votes for update to authenticated
  using (member_id = auth.uid() and public.diable_ratings_open(match_id))
  with check (member_id = auth.uid() and public.diable_ratings_open(match_id) and public.diable_rating_player_eligible(match_id, player_id));
insert into public.schema_migrations (module, version) values ('football','0044_match_rating_eligibility') on conflict do nothing;
commit;
