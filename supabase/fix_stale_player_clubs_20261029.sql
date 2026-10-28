-- Club de la fiche (players.club_id) aligné sur l'affectation active de la saison
-- 2026-2027 quand elle est UNIQUE (sélections écartées). Relevé du 29/10/2026 :
-- 48 Belges suivis affichés dans leur ancien club (A. Calut à Standard au lieu
-- d'Olympic Charleroi, K. Goto à Saint-Trond au lieu de Fribourg…). Le suivi des
-- Belges à l'étranger choisit ses clubs d'après ce champ.
-- Fiches verrouillées jamais touchées. Rejouable sans risque.

-- 1. Aperçu (rien n'est modifié).
with actifs as (
  select m.player_id, (array_agg(distinct m.club_id))[1] as club_id, count(distinct m.club_id) as clubs
  from player_team_seasons m
  join clubs c on c.id = m.club_id
  where m.active and m.season_start_year = 2026 and coalesce(c.team_type, 'first_team') <> 'national'
  group by m.player_id
)
select p.name as joueur, ancien.name as club_fiche, nouveau.name as club_actif
from players p
join actifs a on a.player_id = p.id and a.clubs = 1
left join clubs ancien on ancien.id = p.club_id
join clubs nouveau on nouveau.id = a.club_id
where p.tracked and coalesce(p.locked, false) = false and p.club_id is distinct from a.club_id
order by p.name;

-- 2. Correction.
with actifs as (
  select m.player_id, (array_agg(distinct m.club_id))[1] as club_id, count(distinct m.club_id) as clubs
  from player_team_seasons m
  join clubs c on c.id = m.club_id
  where m.active and m.season_start_year = 2026 and coalesce(c.team_type, 'first_team') <> 'national'
  group by m.player_id
)
update players p
set club_id = a.club_id
from actifs a
where a.player_id = p.id and a.clubs = 1
  and p.tracked and coalesce(p.locked, false) = false
  and p.club_id is distinct from a.club_id;

-- 3. Contrôle : 0 attendu.
with actifs as (
  select m.player_id, (array_agg(distinct m.club_id))[1] as club_id, count(distinct m.club_id) as clubs
  from player_team_seasons m
  join clubs c on c.id = m.club_id
  where m.active and m.season_start_year = 2026 and coalesce(c.team_type, 'first_team') <> 'national'
  group by m.player_id
)
select count(*) as fiches_restantes
from players p join actifs a on a.player_id = p.id and a.clubs = 1
where p.tracked and coalesce(p.locked, false) = false and p.club_id is distinct from a.club_id;
