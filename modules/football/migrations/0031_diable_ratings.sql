-- 0031_diable_ratings.sql — Notes des Diables + Diable du match.
-- Idempotent, additif. Note /10, Belgique A (filtré côté app), fenêtre auto :
-- ouverte à la fin du match, fermée ~4 jours après le coup d'envoi.
begin;

create table if not exists player_ratings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  member_id uuid references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 10),
  created_at timestamptz default now(),
  unique (match_id, member_id, player_id)
);
create index if not exists player_ratings_match on player_ratings (match_id);

create table if not exists motm_votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  member_id uuid references auth.users(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  created_at timestamptz default now(),
  unique (match_id, member_id)
);
create index if not exists motm_votes_match on motm_votes (match_id);

-- Fenêtre de notation : match terminé + moins de 4 jours après le coup d'envoi.
create or replace function diable_ratings_open(mid uuid) returns boolean
language sql stable as $$
  select exists (select 1 from matches m where m.id = mid
    and m.status = 'finished' and m.kickoff is not null
    and now() < m.kickoff + interval '4 days');
$$;

alter table player_ratings enable row level security;
alter table motm_votes enable row level security;
-- Notes individuelles : lecture réservée à l'auteur/admin (les moyennes passent par les vues).
create policy "prat_read"   on player_ratings for select using (member_id = auth.uid() or is_admin());
create policy "prat_insert" on player_ratings for insert with check (member_id = auth.uid() and diable_ratings_open(match_id));
create policy "prat_update" on player_ratings for update using (member_id = auth.uid() and diable_ratings_open(match_id)) with check (member_id = auth.uid() and diable_ratings_open(match_id));
create policy "prat_delete" on player_ratings for delete using (member_id = auth.uid() and diable_ratings_open(match_id));
create policy "motm_read"   on motm_votes for select using (member_id = auth.uid() or is_admin());
create policy "motm_insert" on motm_votes for insert with check (member_id = auth.uid() and diable_ratings_open(match_id));
create policy "motm_update" on motm_votes for update using (member_id = auth.uid() and diable_ratings_open(match_id)) with check (member_id = auth.uid() and diable_ratings_open(match_id));
create policy "motm_delete" on motm_votes for delete using (member_id = auth.uid() and diable_ratings_open(match_id));

-- Vues d'agrégat (moyennes + Diable du match) — publiques, sans exposer les votes individuels.
create or replace view player_match_ratings as
  select match_id, player_id, round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as votes
  from player_ratings group by match_id, player_id;
create or replace view match_motm as
  select match_id, player_id, count(*)::int as votes
  from motm_votes group by match_id, player_id;

insert into public.schema_migrations (module, version)
values ('football', '0031_diable_ratings') on conflict do nothing;

commit;
