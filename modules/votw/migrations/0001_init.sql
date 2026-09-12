-- =============================================================================
--  MODULE VOTW (11 de la semaine) — au-dessus de `football` + auth.
--
--  Principe : les résultats hebdomadaires sont PERSISTÉS/FIGÉS à la
--  publication, jamais recalculés. Toutes les sessions publiées restent en
--  base → archive complète, consultable par journée/semaine.
-- =============================================================================

create table if not exists votw_sessions (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'week',      -- 'week' | 'year'
  matchday int,
  season_label text,                      -- ex. '2026-2027' pour regrouper les semaines
  formation text default '4-3-3',
  status text not null default 'open',    -- open | closed | published
  opens_at timestamptz, closes_at timestamptz,
  -- Snapshot d'AFFICHAGE figé au passage en 'published' (noms/photos).
  -- L'historique ne change jamais, même si une fiche joueur évolue ensuite.
  result jsonb,
  published_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists votw_candidates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references votw_sessions(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  position text not null                  -- GK | DEF | MID | FWD (ou poste précis)
);

create table if not exists votw_votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references votw_sessions(id) on delete cascade,
  member_id uuid references auth.users(id) on delete cascade,
  position text not null,
  player_id uuid references players(id) on delete cascade,
  created_at timestamptz default now(),
  unique (session_id, member_id, position)   -- 1 vote par poste et par membre
);

-- Résultat FIGÉ en relationnel (immuable après publication). Sert à la fois
-- l'archive et les agrégats. `player_snapshot` conserve nom/photo/club même si
-- la fiche joueur est modifiée ou supprimée plus tard (player_id -> null).
create table if not exists votw_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references votw_sessions(id) on delete cascade,
  position text not null,
  player_id uuid references players(id) on delete set null,
  player_snapshot jsonb not null default '{}',   -- { name, photo_url, club }
  votes int not null default 0,
  created_at timestamptz default now()
);
create index if not exists votw_results_player on votw_results (player_id);
create index if not exists votw_results_session on votw_results (session_id);

-- ── Agrégats pour le 11 de l'année ───────────────────────────────────────────
-- Apparitions dans les XI hebdomadaires publiés + total de votes cumulés.
-- Classement des plus sélectionnés = order by week_appearances desc, total_votes desc.
-- 11 de l'année STATISTIQUE = meilleur joueur par poste selon ces apparitions.
-- 11 de l'année COMMUNAUTAIRE (optionnel) = une session kind='year' qui réutilise
--   la mécanique de vote, avec pour candidats le top de cette vue.
create or replace view votw_appearances as
select r.player_id,
       count(*) filter (where s.kind = 'week') as week_appearances,
       coalesce(sum(r.votes), 0)               as total_votes
from votw_results r
join votw_sessions s on s.id = r.session_id
where s.status = 'published'
group by r.player_id;

-- ── RLS : lecture publique, écriture admin ; votes = le membre pose les siens ──
alter table votw_sessions   enable row level security;
alter table votw_candidates enable row level security;
alter table votw_votes      enable row level security;
alter table votw_results    enable row level security;
create policy "votw_sessions_read"  on votw_sessions   for select using (true);
create policy "votw_sessions_write" on votw_sessions   for all using (is_admin()) with check (is_admin());
create policy "votw_cand_read"      on votw_candidates for select using (true);
create policy "votw_cand_write"     on votw_candidates for all using (is_admin()) with check (is_admin());
create policy "votw_results_read"   on votw_results    for select using (true);
create policy "votw_results_write"  on votw_results    for all using (is_admin()) with check (is_admin());
create policy "votw_votes_read"     on votw_votes      for select using (is_admin() or member_id = auth.uid());
create policy "votw_votes_insert"   on votw_votes      for insert with check (member_id = auth.uid());
