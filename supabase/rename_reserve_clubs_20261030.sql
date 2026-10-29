-- Équipes réserves de la Challenger Pro League sous leur vrai nom (30/10/2026).
-- Les synchronisations écrivent désormais elles-mêmes ces noms (lib/frenchClubs.js).
-- Clubs verrouillés non touchés. Rejouable.

begin;
update clubs set name = 'Club NXT' where source = 'apifootball' and external_id = '14130' and coalesce(locked, false) = false;
update clubs set name = 'RSCA Futures' where source = 'apifootball' and external_id = '19046' and coalesce(locked, false) = false;
update clubs set name = 'Jong Genk' where source = 'apifootball' and external_id = '19045' and coalesce(locked, false) = false;
update clubs set name = 'SL16 FC' where source = 'apifootball' and external_id = '19047' and coalesce(locked, false) = false;
commit;

-- Contrôle : 4 lignes attendues.
select external_id, name from clubs where source = 'apifootball' and external_id in ('14130', '19046', '19045', '19047') order by name;
