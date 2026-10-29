-- Noms de clubs en français (30/10/2026), généré depuis la base en lecture seule.
-- Les synchronisations écrivent désormais elles-mêmes le nom français
-- (modules/football/sync.js) : ce script ne fait que rattraper l'existant.
-- Clubs verrouillés et sélections non touchés. Rejouable.
-- 46 clubs renommés sur 2016.

begin;
update clubs set name = 'Eintracht Francfort' where id = '09e4399a-bc31-4994-bee5-8f8939f2bb96' and coalesce(locked, false) = false; -- Eintracht Frankfurt
update clubs set name = 'Club Bruges U19' where id = '0c1a4cbb-ec52-47e9-93cf-0dea0ff4ea28' and coalesce(locked, false) = false; -- Club Brugge U19
update clubs set name = 'Dynamo Kiev' where id = '0cb69634-94d8-4c65-a5ca-ecf07d3fe486' and coalesce(locked, false) = false; -- Dynamo Kyiv
update clubs set name = 'La Gantoise' where id = '127e0d8c-4dba-4c5a-8364-17436f721591' and coalesce(locked, false) = false; -- Gent
update clubs set name = 'Olympiakos' where id = '14266f27-78e0-45f9-af41-1899f82a9834' and coalesce(locked, false) = false; -- Olympiakos Piraeus
update clubs set name = 'Bayern Munich' where id = '158be67f-247a-459a-877c-70f5ae911633' and coalesce(locked, false) = false; -- Bayern München
update clubs set name = 'La Gantoise U19' where id = '165e531e-5eba-42b8-9405-69ac5f75b2f0' and coalesce(locked, false) = false; -- Gent U19
update clubs set name = 'FC Cologne' where id = '3878d755-6eab-49c8-a008-30a1d0c0732c' and coalesce(locked, false) = false; -- 1. FC Köln
update clubs set name = 'Saint-Trond' where id = '4b3317f3-8b62-49cb-9f6c-ecccb05e4509' and coalesce(locked, false) = false; -- St. Truiden
update clubs set name = 'Sporting Charleroi' where id = '4d6d50df-1183-426d-85c2-ff8d224f21b4' and coalesce(locked, false) = false; -- Charleroi
update clubs set name = 'Naples' where id = '5117d576-21a5-411f-9f85-190468c8186d' and coalesce(locked, false) = false; -- Napoli
update clubs set name = 'Rapid Vienne' where id = '59a8325b-9dd1-4138-8f7c-c50c257d1883' and coalesce(locked, false) = false; -- Rapid Vienna
update clubs set name = 'Lierse' where id = '63f47d26-ec35-4af6-9e01-56cf57f87cae' and coalesce(locked, false) = false; -- K. Lierse S.K.
update clubs set name = 'FC Bâle' where id = '673d9178-c79e-4599-8a91-5774f90ed9ca' and coalesce(locked, false) = false; -- FC Basel 1893
update clubs set name = 'AS Monaco' where id = '6bb0638f-be09-4e17-bcc1-1bf5303749c3' and coalesce(locked, false) = false; -- Monaco
update clubs set name = 'Union Saint-Gilloise' where id = '6ce140ec-b484-4fcf-967f-bdd8a7322a44' and coalesce(locked, false) = false; -- Union St. Gilloise
update clubs set name = 'La Gantoise II' where id = '6d66b85e-efc4-4645-bcf4-f2f9a460571c' and coalesce(locked, false) = false; -- KAA Gent II
update clubs set name = 'Courtrai' where id = '6e8114aa-b633-420f-bc0b-917ca8e8ac69' and coalesce(locked, false) = false; -- Kortrijk
update clubs set name = 'FC Barcelone' where id = '71572ab6-9041-40b7-8147-970896cf4730' and coalesce(locked, false) = false; -- Barcelona
update clubs set name = 'Club Bruges II' where id = '722ec1a9-62b0-4fb9-b4b6-b571f5ce1743' and coalesce(locked, false) = false; -- Club Brugge II
update clubs set name = 'Olympique lyonnais' where id = '7406290e-9075-4cf9-abea-e37d1302966e' and coalesce(locked, false) = false; -- Lyon
update clubs set name = 'Seraing' where id = '790a45eb-e465-4c33-a1d8-846d3b482169' and coalesce(locked, false) = false; -- Seraing United
update clubs set name = 'Spartak Moscou' where id = '82dc2fcb-fd28-4ed8-8cf3-419c1c7d9839' and coalesce(locked, false) = false; -- Spartak Moscow
update clubs set name = 'Slavia Prague' where id = '86b3d8cf-613b-4ddb-931b-8c16ed84e011' and coalesce(locked, false) = false; -- Slavia Praha
update clubs set name = 'AS Rome' where id = '8914fa41-c41d-47c1-834a-c15b6225a823' and coalesce(locked, false) = false; -- AS Roma
update clubs set name = 'LASK' where id = '9390b701-5ba3-4f4b-8740-79833c4e24a0' and coalesce(locked, false) = false; -- Lask Linz
update clubs set name = 'Atlético Madrid' where id = '953e925f-ad10-4267-9003-b6be23debbcc' and coalesce(locked, false) = false; -- Atletico Madrid
update clubs set name = 'Standard de Liège' where id = '95971151-6b05-48e0-96cf-74baa9e5647f' and coalesce(locked, false) = false; -- Standard Liege
update clubs set name = 'Beveren' where id = '97f2b450-320e-42bd-a97d-5d29c5bf7372' and coalesce(locked, false) = false; -- SK Beveren
update clubs set name = 'FC Copenhague' where id = '98905cc7-d25f-42ef-b804-b3953ea65a64' and coalesce(locked, false) = false; -- FC Copenhagen
update clubs set name = 'Wolverhampton' where id = '99e96920-5bab-400e-ac8b-33f1f7bd6bc2' and coalesce(locked, false) = false; -- Wolves
update clubs set name = 'Olympique de Marseille' where id = 'a7a5340b-0501-4068-963a-05f18d944360' and coalesce(locked, false) = false; -- Marseille
update clubs set name = 'Sparta Prague' where id = 'a958db8f-31b7-4931-87f6-6ada9251839e' and coalesce(locked, false) = false; -- Sparta Praha
update clubs set name = 'Valence' where id = 'aec6b58e-f1fb-422a-9005-c5cc7c72cd87' and coalesce(locked, false) = false; -- Valencia
update clubs set name = 'Paris Saint-Germain' where id = 'b864d38b-b935-4118-ad69-9006e0d31939' and coalesce(locked, false) = false; -- Paris Saint Germain
update clubs set name = 'KV Malines' where id = 'c3a3cf51-7bc5-451f-af34-41ce43e1ee82' and coalesce(locked, false) = false; -- KV Mechelen
update clubs set name = 'Beerschot' where id = 'ca7a476c-ee5c-4f42-b022-506d73e6d07e' and coalesce(locked, false) = false; -- Beerschot VA
update clubs set name = 'Austria Vienne' where id = 'cd7e9667-d113-4b2e-af0b-993df6695bbf' and coalesce(locked, false) = false; -- Austria Vienna
update clubs set name = 'Cercle Bruges II' where id = 'd31a7711-54de-40f9-a309-800eaf1b72f1' and coalesce(locked, false) = false; -- Cercle Brugge II
update clubs set name = 'Inter Milan' where id = 'd6ff1c12-daa8-4f29-bbbc-9850eca0b5da' and coalesce(locked, false) = false; -- Inter
update clubs set name = 'OH Louvain' where id = 'e337ca59-5ce5-4b84-a032-981a4e463cda' and coalesce(locked, false) = false; -- OH Leuven
update clubs set name = 'Lazio Rome' where id = 'ee43c8b2-db45-46f6-9978-d41fc1b12bc7' and coalesce(locked, false) = false; -- Lazio
update clubs set name = 'Club Bruges' where id = 'f012418d-b844-431b-82b6-aafce85b2ef0' and coalesce(locked, false) = false; -- Club Brugge KV
update clubs set name = 'Westerlo' where id = 'f2ced755-b7ab-4155-a3e2-6f035e9eea30' and coalesce(locked, false) = false; -- KVC Westerlo
update clubs set name = 'Cercle Bruges' where id = 'f79900c9-3fc8-4d6e-bb37-49f102d2c6c7' and coalesce(locked, false) = false; -- Cercle Brugge
update clubs set name = 'FC Séville' where id = 'f9f6fd35-85b0-450c-8659-db82d7977622' and coalesce(locked, false) = false; -- Sevilla
commit;

-- Contrôle : clubs renommés.
select name from clubs where id in ('09e4399a-bc31-4994-bee5-8f8939f2bb96', '0c1a4cbb-ec52-47e9-93cf-0dea0ff4ea28', '0cb69634-94d8-4c65-a5ca-ecf07d3fe486', '127e0d8c-4dba-4c5a-8364-17436f721591', '14266f27-78e0-45f9-af41-1899f82a9834', '158be67f-247a-459a-877c-70f5ae911633', '165e531e-5eba-42b8-9405-69ac5f75b2f0', '3878d755-6eab-49c8-a008-30a1d0c0732c', '4b3317f3-8b62-49cb-9f6c-ecccb05e4509', '4d6d50df-1183-426d-85c2-ff8d224f21b4', '5117d576-21a5-411f-9f85-190468c8186d', '59a8325b-9dd1-4138-8f7c-c50c257d1883', '63f47d26-ec35-4af6-9e01-56cf57f87cae', '673d9178-c79e-4599-8a91-5774f90ed9ca', '6bb0638f-be09-4e17-bcc1-1bf5303749c3', '6ce140ec-b484-4fcf-967f-bdd8a7322a44', '6d66b85e-efc4-4645-bcf4-f2f9a460571c', '6e8114aa-b633-420f-bc0b-917ca8e8ac69', '71572ab6-9041-40b7-8147-970896cf4730', '722ec1a9-62b0-4fb9-b4b6-b571f5ce1743', '7406290e-9075-4cf9-abea-e37d1302966e', '790a45eb-e465-4c33-a1d8-846d3b482169', '82dc2fcb-fd28-4ed8-8cf3-419c1c7d9839', '86b3d8cf-613b-4ddb-931b-8c16ed84e011', '8914fa41-c41d-47c1-834a-c15b6225a823', '9390b701-5ba3-4f4b-8740-79833c4e24a0', '953e925f-ad10-4267-9003-b6be23debbcc', '95971151-6b05-48e0-96cf-74baa9e5647f', '97f2b450-320e-42bd-a97d-5d29c5bf7372', '98905cc7-d25f-42ef-b804-b3953ea65a64', '99e96920-5bab-400e-ac8b-33f1f7bd6bc2', 'a7a5340b-0501-4068-963a-05f18d944360', 'a958db8f-31b7-4931-87f6-6ada9251839e', 'aec6b58e-f1fb-422a-9005-c5cc7c72cd87', 'b864d38b-b935-4118-ad69-9006e0d31939', 'c3a3cf51-7bc5-451f-af34-41ce43e1ee82', 'ca7a476c-ee5c-4f42-b022-506d73e6d07e', 'cd7e9667-d113-4b2e-af0b-993df6695bbf', 'd31a7711-54de-40f9-a309-800eaf1b72f1', 'd6ff1c12-daa8-4f29-bbbc-9850eca0b5da', 'e337ca59-5ce5-4b84-a032-981a4e463cda', 'ee43c8b2-db45-46f6-9978-d41fc1b12bc7', 'f012418d-b844-431b-82b6-aafce85b2ef0', 'f2ced755-b7ab-4155-a3e2-6f035e9eea30', 'f79900c9-3fc8-4d6e-bb37-49f102d2c6c7', 'f9f6fd35-85b0-450c-8659-db82d7977622') order by name;
