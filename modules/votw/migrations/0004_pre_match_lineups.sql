-- Étend le moteur du Onze de la semaine aux compositions des Diables avant-match.
-- Additif et idempotent : les sessions hebdomadaires existantes restent inchangées.
begin;

alter table public.votw_sessions
  add column if not exists match_id uuid references public.matches(id) on delete cascade,
  add column if not exists national_team_id uuid references public.clubs(id) on delete set null;

alter table public.votw_votes
  add column if not exists formation text not null default '4-3-3';

create unique index if not exists votw_one_pre_match_session
  on public.votw_sessions (match_id)
  where kind = 'pre_match' and match_id is not null;

create index if not exists votw_pre_match_lookup
  on public.votw_sessions (kind, match_id, status, closes_at)
  where kind = 'pre_match';

create or replace function public.votw_slot_category(slot text) returns text
language sql immutable as $$
  select case
    when slot = 'GK' then 'GK'
    when slot in ('LB','CB1','CB2','CB3','RB','LWB','RWB') then 'DEF'
    when slot in ('LM','CM1','CM2','CM3','RM','DM','AM') then 'MID'
    when slot in ('LW','ST','ST1','ST2','RW') then 'FWD'
    else 'MID' end;
$$;

insert into public.schema_migrations (module, version)
values ('votw', '0004_pre_match_lineups')
on conflict do nothing;

commit;
