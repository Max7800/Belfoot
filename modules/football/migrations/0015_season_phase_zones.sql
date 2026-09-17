-- Les règles de classement changent selon la saison et parfois selon la phase.
-- Exemple : anciennes saisons avec play-offs, puis JPL 2026-2027 à 18 sans play-offs.
alter table seasons
  add column if not exists zones_by_phase jsonb not null default '{}';

-- Transition : les zones historiques de la compétition restent uniquement sur
-- la saison régulière. Les autres phases n'héritent plus de ces couleurs.
update seasons s
set zones_by_phase = jsonb_build_object('Regular Season', c.zones)
from competitions c
where s.competition_id = c.id
  and coalesce(jsonb_array_length(c.zones), 0) > 0
  and coalesce(s.label, '') not like '2026%'
  and s.zones_by_phase = '{}';
