-- =============================================================================
--  MODULE FOOTBALL — tables métier dédiées (PAS la table `entries`).
--  Le socle reste générique ; ce fichier est la migration propre du module.
-- =============================================================================

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null, short_name text, logo_url text, city text,
  created_at timestamptz default now()
);
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete set null,
  name text not null, position text, number int, photo_url text,
  created_at timestamptz default now()
);
create table if not exists coaches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete set null,
  name text not null, photo_url text
);
create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null, logo_url text
);
create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  label text not null
);

-- Matchs — pensés manuel -> API dès le départ via `source` + `external_id`.
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete set null,
  season_id uuid references seasons(id) on delete set null,
  matchday int,
  home_club_id uuid references clubs(id),
  away_club_id uuid references clubs(id),
  home_score int, away_score int,
  status text not null default 'scheduled',  -- scheduled | live | finished | postponed
  minute int,
  kickoff timestamptz,
  source text not null default 'manual',      -- manual | api
  external_id text,                           -- clé d'upsert pour l'API future
  created_at timestamptz default now(),
  unique (source, external_id)
);
create index if not exists matches_lookup on matches (competition_id, season_id, matchday);

create table if not exists match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  minute int,
  type text not null,                         -- goal | assist | yellow | red | sub
  player_id uuid references players(id) on delete set null,
  club_id uuid references clubs(id) on delete set null,
  created_at timestamptz default now()
);

-- ── Dérivés (classement / buteurs / passeurs) ────────────────────────────────
-- Calculés, jamais stockés → aucune double saisie, jamais de désync.
-- NOTE PERF : si le live devient lourd, transformer ces `view` en
-- `materialized view` + un refresh (cron/trigger). Aucune autre modif requise.
create or replace view standings as
with r as (
  select competition_id, season_id, home_club_id club_id, home_score gf, away_score ga,
         case when home_score>away_score then 3 when home_score=away_score then 1 else 0 end pts
  from matches where status='finished'
  union all
  select competition_id, season_id, away_club_id, away_score, home_score,
         case when away_score>home_score then 3 when away_score=home_score then 1 else 0 end
  from matches where status='finished'
)
select competition_id, season_id, club_id,
  count(*) played,
  sum((pts=3)::int) won, sum((pts=1)::int) drawn, sum((pts=0)::int) lost,
  sum(gf) goals_for, sum(ga) goals_against, sum(gf)-sum(ga) goal_diff, sum(pts) points
from r group by competition_id, season_id, club_id;

create or replace view top_scorers as
select m.competition_id, e.player_id, count(*) goals
from match_events e join matches m on m.id=e.match_id
where e.type='goal' group by m.competition_id, e.player_id;

create or replace view top_assists as
select m.competition_id, e.player_id, count(*) assists
from match_events e join matches m on m.id=e.match_id
where e.type='assist' group by m.competition_id, e.player_id;

-- ── RLS : lecture publique, écriture admin ───────────────────────────────────
do $$ declare t text;
begin
  foreach t in array array['clubs','players','coaches','competitions','seasons','matches','match_events'] loop
    execute format('alter table %I enable row level security;', t);
    execute format($p$create policy "%s_read"  on %I for select using (true);$p$, t, t);
    execute format($p$create policy "%s_write" on %I for all using (is_admin()) with check (is_admin());$p$, t, t);
  end loop;
end $$;


-- external_id généralisé : toute entité métier peut être synchronisée depuis une
-- source externe (upsert par (source, external_id)). Manuel par défaut.
do $$ declare t text;
begin
  foreach t in array array['clubs','players','coaches','competitions','seasons'] loop
    execute format('alter table %I add column if not exists source text not null default ''manual'';', t);
    execute format('alter table %I add column if not exists external_id text;', t);
    execute format('create unique index if not exists %I_ext on %I (source, external_id) where external_id is not null;', t, t);
  end loop;
end $$;

-- Séparation éditorial / externe + protection des saisies manuelles.
-- `ext` = payload brut du fournisseur (jamais mélangé à nos champs).
-- `locked` = vrai pour une saisie manuelle -> une synchro ne l'écrase JAMAIS.
-- `synced_at` = date de dernière synchro. `provider` par compétition (multi-sources).
do $$ declare t text;
begin
  foreach t in array array['clubs','players','coaches','competitions','seasons','matches'] loop
    execute format('alter table %I add column if not exists ext jsonb not null default ''{}'';', t);
    execute format('alter table %I add column if not exists locked boolean not null default false;', t);
    execute format('alter table %I add column if not exists synced_at timestamptz;', t);
  end loop;
end $$;
alter table competitions add column if not exists provider text;   -- ex 'api-foot' | 'csv' | 'manual'
alter table matches      add column if not exists provider text;   -- source live de CE match
