-- Lecture publique bornée des dernières performances des joueurs suivis.
-- SECURITY INVOKER conserve les politiques RLS des tables sous-jacentes.
create or replace function public.abroad_recent_performances(p_player_ids uuid[])
returns table (id uuid, match_id uuid, player_id uuid, club_id uuid,
  minutes integer, goals integer, assists integer, rating numeric)
language plpgsql stable security invoker set search_path = public
as $$
begin
  if coalesce(cardinality(p_player_ids), 0) > 80 then
    raise exception '80 joueurs maximum par requête';
  end if;
  return query
    select recent.id, recent.match_id, recent.player_id, recent.club_id,
      recent.minutes, recent.goals, recent.assists, recent.rating
    from (select distinct unnest(p_player_ids) as id) requested
    join public.players p on p.id = requested.id and p.tracked = true and p.active = true
    cross join lateral (
      select q.id, q.match_id, q.player_id, q.club_id, q.minutes, q.goals, q.assists, q.rating
      from (
        select s.id, s.match_id, s.player_id, s.club_id, s.minutes, s.goals, s.assists, s.rating,
          m.kickoff, row_number() over (partition by s.match_id order by s.synced_at desc nulls last, s.id) as duplicate_rank
        from public.match_player_stats s
        join public.matches m on m.id = s.match_id
        left join public.clubs club on club.id = s.club_id
        where s.player_id = p.id and s.minutes > 0
          and coalesce(club.team_type, '') <> 'national'
          and m.kickoff <= now() and m.kickoff >= now() - interval '45 days'
      ) q
      where q.duplicate_rank = 1
      order by q.kickoff desc, q.id
      limit 5
    ) recent;
end $$;

revoke all on function public.abroad_recent_performances(uuid[]) from public;
grant execute on function public.abroad_recent_performances(uuid[]) to anon, authenticated;
