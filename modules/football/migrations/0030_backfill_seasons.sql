-- 0030_backfill_seasons.sql
-- Remise à plat unique du legacy « saison » (générique, idempotent, rejouable).
-- Ne touche QU'AUX trous ; les données déjà correctes ne bougent pas.
--
--   1) crée les saisons manquantes, déduites de la date de chaque match orphelin
--      (règle foot : mois >= 7 => saison N/N+1) ;
--   2) rattache les matchs sans saison à la saison correspondant à leur date ;
--   3) renseigne ext.season / ext.season_label sur les compétitions où c'est vide,
--      déduit de la saison la plus récente réellement rattachée (aucune valeur
--      codée en dur, aucun traitement compétition par compétition).
--
-- Rappel : le code d'import (syncCompetition / syncNationalTeam) pose déjà
-- correctement season_id ; ce backfill ne corrige que d'anciennes données.
begin;

-- 1) Saisons manquantes.
insert into seasons (competition_id, label)
select distinct m.competition_id,
       (case when extract(month from m.kickoff) >= 7
             then extract(year from m.kickoff)::int
             else extract(year from m.kickoff)::int - 1 end)::text
       || '-' ||
       (case when extract(month from m.kickoff) >= 7
             then extract(year from m.kickoff)::int + 1
             else extract(year from m.kickoff)::int end)::text
from matches m
where m.season_id is null and m.kickoff is not null
on conflict (competition_id, label) do nothing;

-- 2) Rattachement des matchs orphelins à la saison de leur date.
update matches m
set season_id = s.id
from seasons s
where m.season_id is null
  and m.kickoff is not null
  and s.competition_id = m.competition_id
  and s.label = (case when extract(month from m.kickoff) >= 7
                      then extract(year from m.kickoff)::int
                      else extract(year from m.kickoff)::int - 1 end)::text
             || '-' ||
                (case when extract(month from m.kickoff) >= 7
                      then extract(year from m.kickoff)::int + 1
                      else extract(year from m.kickoff)::int end)::text;

-- 3) ext.season / ext.season_label manquants, depuis la saison la plus récente
--    réellement rattachée aux matchs de la compétition.
update competitions c
set ext = coalesce(c.ext, '{}'::jsonb)
        || jsonb_build_object('season', split_part(cs.label, '-', 1), 'season_label', cs.label)
from (
  select distinct on (competition_id) competition_id, label
  from seasons
  order by competition_id, label desc
) cs
where cs.competition_id = c.id
  and (c.ext->>'season') is null;

insert into public.schema_migrations (module, version)
values ('football', '0030_backfill_seasons') on conflict do nothing;

commit;
