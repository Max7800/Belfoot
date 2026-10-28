-- Entités HTML laissées par API-Football dans les noms (« D. O&apos;Shea ») :
-- décodées dans les données déjà stockées. Les nouvelles lectures arrivent
-- décodées (PR « entités HTML », lib/mojibake.js). Rejouable sans risque ;
-- les lignes verrouillées (saisie éditoriale) ne sont pas touchées.
-- Relevé du 28/10/2026 : 28 joueurs, 2 transferts.

update players
set name = replace(replace(replace(name, '&apos;', ''''), '&#39;', ''''), '&amp;', '&')
where (name like '%&apos;%' or name like '%&#39;%' or name like '%&amp;%')
  and coalesce(locked, false) = false;

update player_transfers
set player_name = replace(replace(replace(player_name, '&apos;', ''''), '&#39;', ''''), '&amp;', '&')
where player_name like '%&apos;%' or player_name like '%&#39;%' or player_name like '%&amp;%';

update match_player_stats
set player_name = replace(replace(replace(player_name, '&apos;', ''''), '&#39;', ''''), '&amp;', '&')
where (player_name like '%&apos;%' or player_name like '%&#39;%' or player_name like '%&amp;%')
  and coalesce(locked, false) = false;

-- Contrôle : 0 partout attendu.
select
  (select count(*) from players where name like '%&apos;%' or name like '%&amp;%') as joueurs_restants,
  (select count(*) from player_transfers where player_name like '%&apos;%' or player_name like '%&amp;%') as transferts_restants,
  (select count(*) from match_player_stats where player_name like '%&apos;%' or player_name like '%&amp;%') as performances_restantes;
