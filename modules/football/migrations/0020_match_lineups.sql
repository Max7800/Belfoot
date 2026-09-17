-- Compositions et performances individuelles par match.
-- Les données provider restent séparées des corrections manuelles grâce à `locked`.
create table if not exists match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  competition_id uuid references competitions(id) on delete cascade,
  club_id uuid references clubs(id) on delete cascade,
  formation text,
  source text not null default 'manual',
  locked boolean not null default false,
  synced_at timestamptz,
  ext jsonb not null default '{}',
  unique (match_id, club_id)
);

create table if not exists match_player_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  competition_id uuid references competitions(id) on delete cascade,
  club_id uuid references clubs(id) on delete set null,
  player_id uuid references players(id) on delete set null,
  player_external_id text,
  player_name text,
  number int,
  position text,
  grid text,
  starter boolean not null default false,
  substitute boolean not null default false,
  captain boolean not null default false,
  minutes int,
  rating numeric,
  goals int not null default 0,
  assists int not null default 0,
  saves int not null default 0,
  goals_conceded int,
  yellow int not null default 0,
  red int not null default 0,
  source text not null default 'manual',
  locked boolean not null default false,
  synced_at timestamptz,
  ext jsonb not null default '{}',
  unique (match_id, source, player_external_id)
);

create index if not exists match_lineups_match on match_lineups (match_id);
create index if not exists match_player_stats_match on match_player_stats (match_id, club_id);
create index if not exists match_player_stats_player on match_player_stats (player_id, match_id);
create index if not exists match_player_stats_competition on match_player_stats (competition_id, match_id);

alter table match_lineups enable row level security;
alter table match_player_stats enable row level security;

drop policy if exists "match_lineups_read" on match_lineups;
drop policy if exists "match_lineups_write" on match_lineups;
drop policy if exists "match_player_stats_read" on match_player_stats;
drop policy if exists "match_player_stats_write" on match_player_stats;
create policy "match_lineups_read" on match_lineups for select using (true);
create policy "match_lineups_write" on match_lineups for all using (is_admin()) with check (is_admin());
create policy "match_player_stats_read" on match_player_stats for select using (true);
create policy "match_player_stats_write" on match_player_stats for all using (is_admin()) with check (is_admin());
