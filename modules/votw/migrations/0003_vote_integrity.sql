-- 0003_vote_integrity.sql — consolidation sécurité des votes (au niveau base).
-- Idempotent, additif. Ne modifie pas 0001/0002.
begin;

-- La session est-elle ouverte ET dans sa fenêtre de vote ?
create or replace function votw_session_votable(sid uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from votw_sessions s
    where s.id = sid and s.status = 'open'
      and (s.opens_at is null or s.opens_at <= now())
      and (s.closes_at is null or s.closes_at > now())
  );
$$;

-- Slot (GK, LB, CB1…RW) -> catégorie (GK/DEF/MID/FWD), aligné sur lib/votw (4-3-3).
create or replace function votw_slot_category(slot text) returns text
language sql immutable as $$
  select case
    when slot = 'GK' then 'GK'
    when slot in ('LB','CB1','CB2','RB') then 'DEF'
    when slot in ('CM1','CM2','CM3') then 'MID'
    when slot in ('LW','ST','RW') then 'FWD'
    else 'MID' end;
$$;

-- RLS : un membre gère UNIQUEMENT ses propres votes, et seulement si la session
-- est votable (ouverte + dans sa fenêtre). Corrige aussi l'absence d'update/delete.
drop policy if exists "votw_votes_insert" on votw_votes;
create policy "votw_votes_insert" on votw_votes for insert
  with check (member_id = auth.uid() and votw_session_votable(session_id));
drop policy if exists "votw_votes_update" on votw_votes;
create policy "votw_votes_update" on votw_votes for update
  using (member_id = auth.uid() and votw_session_votable(session_id))
  with check (member_id = auth.uid() and votw_session_votable(session_id));
drop policy if exists "votw_votes_delete" on votw_votes;
create policy "votw_votes_delete" on votw_votes for delete
  using (member_id = auth.uid() and votw_session_votable(session_id));

-- Un même joueur ne peut occuper deux places du même XI (par membre/session).
create unique index if not exists votw_votes_one_player
  on votw_votes (session_id, member_id, player_id);

-- Intégrité : le joueur voté doit être candidat de la session ET compatible avec le poste.
create or replace function votw_vote_check() returns trigger
language plpgsql as $$
declare cat text;
begin
  select position into cat from votw_candidates
    where session_id = NEW.session_id and player_id = NEW.player_id limit 1;
  if cat is null then
    raise exception 'Joueur non éligible pour cette session.';
  end if;
  if cat is distinct from votw_slot_category(NEW.position) then
    raise exception 'Joueur incompatible avec ce poste.';
  end if;
  return NEW;
end $$;
drop trigger if exists votw_votes_check on votw_votes;
create trigger votw_votes_check before insert or update on votw_votes
  for each row execute function votw_vote_check();

insert into public.schema_migrations (module, version)
values ('votw', '0001_init'), ('votw', '0003_vote_integrity') on conflict do nothing;

commit;
