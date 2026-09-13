create table if not exists player_season_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  competition_id uuid references competitions(id) on delete set null,
  season text,
  appearances int, lineups int, minutes int, goals int, assists int, yellow int, red int, rating numeric,
  source text, external_id text, synced_at timestamptz,
  unique (player_id, season)
);
alter table player_season_stats enable row level security;
create policy "pss_read"  on player_season_stats for select using (true);
create policy "pss_write" on player_season_stats for all using (is_admin()) with check (is_admin());
