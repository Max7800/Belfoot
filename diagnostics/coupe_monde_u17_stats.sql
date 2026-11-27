-- Diagnostic en lecture seule : aucun appel API et aucune modification.
-- Vérifie les sources utilisées par la page, sans les confondre.
with cible as (
  select id from competitions
  where id = 'd7088941-8ca5-4d6f-aa3d-c3724d44ba2b'::uuid
), saison as (
  select id, label, import_status, public_active
  from seasons where competition_id = (select id from cible) and label = '2026-2027'
), matchs as (
  select id, status, events_synced_at, lineups_synced_at, player_stats_synced_at, team_stats_synced_at
  from matches where competition_id = (select id from cible) and season_id = (select id from saison)
), details as (
  select p.* from match_player_stats p join matchs m on m.id = p.match_id
), faits as (
  select e.* from match_events e join matchs m on m.id = e.match_id
), saison_stats as (
  select * from player_season_stats where competition_id = (select id from cible) and season like '2026%'
)
select
  (select row_to_json(s) from saison s) as saison,
  (select count(*) from matchs) as matchs_importes,
  (select count(*) from matchs where status = 'finished') as matchs_termines,
  (select count(*) from matchs where status = 'finished' and events_synced_at is not null) as matchs_evenements_marques,
  (select count(*) from matchs where status = 'finished' and player_stats_synced_at is not null) as matchs_stats_marques,
  (select count(distinct match_id) from faits where type = 'goal') as matchs_avec_buts_evenements,
  (select count(*) from faits where type = 'goal') as buts_evenements,
  (select count(*) from faits where type = 'goal' and player_id is not null) as buts_evenements_joueur_relie,
  (select count(distinct match_id) from details) as matchs_avec_lignes_joueur,
  (select count(*) from details) as lignes_joueur_match,
  (select count(*) from details where player_id is null) as lignes_joueur_non_reliees,
  (select count(*) from details where goals > 0) as lignes_joueur_avec_but,
  (select count(*) from saison_stats) as lignes_stat_saison,
  (select count(distinct club_id) from saison_stats) as equipes_avec_stats_saison,
  (select coalesce(jsonb_agg(x order by x.lignes desc), '[]'::jsonb) from (
    select c.name as equipe, count(*) as lignes, sum(coalesce(p.goals, 0)) as buts
    from saison_stats p left join clubs c on c.id = p.club_id
    group by c.name
  ) x) as stats_saison_par_equipe,
  (select coalesce(jsonb_agg(x order by x.lignes desc), '[]'::jsonb) from (
    select c.name as equipe, count(*) as lignes,
      count(*) filter (where p.player_id is null) as non_reliees,
      sum(coalesce(p.goals, 0)) as buts
    from details p left join clubs c on c.id = p.club_id
    group by c.name
  ) x) as stats_match_par_equipe;
