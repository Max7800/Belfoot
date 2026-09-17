-- Une même saison peut contenir des statistiques distinctes pour un championnat
-- et une coupe. Les anciennes lignes restent en place ; une resynchronisation de
-- chaque compétition reconstruira les jeux de statistiques séparés.
alter table player_season_stats
  drop constraint if exists player_season_stats_player_id_season_key;

alter table player_season_stats
  drop constraint if exists player_season_stats_player_competition_season_key;

alter table player_season_stats
  add constraint player_season_stats_player_competition_season_key
  unique (player_id, competition_id, season);

create index if not exists player_season_stats_competition_season
  on player_season_stats (competition_id, season);
