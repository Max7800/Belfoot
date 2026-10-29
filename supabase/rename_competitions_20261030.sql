-- Noms de compétitions en français et adresses françaises des compétitions
-- visibles (30/10/2026). Généré depuis la base en lecture seule, une ligne par
-- compétition ; les fiches verrouillées ne sont pas touchées. Les anciennes adresses
-- restent valables (ext.route_aliases, lib/competitionRoutes.js). Rejouable.
-- 81 compétitions modifiées.

begin;
update competitions set name = '1. Division (Chypre)' where id = '835006b6-515c-4e9a-b085-9660c226c652' and coalesce(locked, false) = false;
update competitions set name = '2. Liga (Autriche)' where id = 'f1ab74bd-34f8-4feb-b461-88f8a77e87ba' and coalesce(locked, false) = false;
update competitions set name = 'Coupe d''Afrique des nations' where id = '0eaebbb9-ed09-46df-bead-b8593018b4d2' and coalesce(locked, false) = false;
update competitions set name = 'Coupe d''Afrique des nations U20' where id = '378d6af3-d3ad-4533-b592-050954372177' and coalesce(locked, false) = false;
update competitions set name = 'Bundesliga (Autriche)' where id = 'c1ba77bf-4593-425e-a825-39fe27ff241b' and coalesce(locked, false) = false;
update competitions set name = 'Bundesliga (Allemagne)' where id = '5fd89999-b5dd-4b46-a8fc-0a5b6ffb0dea' and coalesce(locked, false) = false;
update competitions set name = 'Ligue des champions', slug = 'ligue-des-champions', ext = jsonb_set(coalesce(ext, '{}'::jsonb), '{route_aliases}', '["champion-s-league"]'::jsonb) where id = 'a9fdcedd-0bcd-42ed-8457-a401aa365556' and coalesce(locked, false) = false;
update competitions set name = 'Ligue des nations de la CONCACAF' where id = '212046c3-8293-4987-b7c5-bfa5b7da2e0e' and coalesce(locked, false) = false;
update competitions set name = 'Ligue Conférence', slug = 'ligue-conference', ext = jsonb_set(coalesce(ext, '{}'::jsonb), '{route_aliases}', '["conference-league"]'::jsonb) where id = 'c22aa24a-5b40-4d2d-a438-77812b451871' and coalesce(locked, false) = false;
update competitions set name = 'Coupe du Roi' where id = '0fedc35c-976b-4790-93e6-a7b50fbfd6dd' and coalesce(locked, false) = false;
update competitions set slug = 'croky-cup', ext = jsonb_set(coalesce(ext, '{}'::jsonb), '{route_aliases}', '[]'::jsonb) where id = 'dd0ab0e9-0bd4-4039-ab44-b6249650007a' and coalesce(locked, false) = false;
update competitions set name = 'Coupe (Chypre)' where id = 'c051b461-2c8a-488c-adf1-1d9406e83e32' and coalesce(locked, false) = false;
update competitions set name = 'Coupe (Slovénie)' where id = '858ad4ae-676a-4478-8c50-69eb954e1158' and coalesce(locked, false) = false;
update competitions set name = 'Coupe (Bulgarie)' where id = '14ec1b0c-32b8-4c6e-b6e6-a0429eb4f639' and coalesce(locked, false) = false;
update competitions set name = 'Coupe (Grèce)' where id = 'd7efdbfc-fa0f-451d-8e77-f15dfc5ed7a3' and coalesce(locked, false) = false;
update competitions set name = 'Coupe (Russie)' where id = 'c91431d7-8c60-4a1f-a7f5-9dfc65f36119' and coalesce(locked, false) = false;
update competitions set name = 'Coupe (Lituanie)' where id = 'a50d401f-2ece-46eb-9ce5-c9239a0ec884' and coalesce(locked, false) = false;
update competitions set name = 'Coupe (Autriche)' where id = 'b8388a71-19f8-476b-a6c6-8417bfa19aca' and coalesce(locked, false) = false;
update competitions set name = 'Coupe (Croatie)' where id = 'f8ba8488-c50a-4e91-8d93-0eae4e204ab8' and coalesce(locked, false) = false;
update competitions set name = 'Coupe (Slovaquie)' where id = 'ff4a2094-8ee5-4612-b8a8-393324786bf5' and coalesce(locked, false) = false;
update competitions set name = 'Coupe (Serbie)' where id = '76cc95e8-67af-4cb3-8d23-99462c3e69d9' and coalesce(locked, false) = false;
update competitions set name = 'Coupe (Pologne)' where id = '4bbc225e-e8f7-469b-8e1a-1f02adfc58c1' and coalesce(locked, false) = false;
update competitions set name = 'Euro' where id = '9f35c25a-17a1-4640-ab14-e566662274ac' and coalesce(locked, false) = false;
update competitions set name = 'Qualifications Euro' where id = 'f4c7ed7a-9fb1-48b5-af5b-cee148e2f633' and coalesce(locked, false) = false;
update competitions set name = 'Ligue Europa', slug = 'ligue-europa', ext = jsonb_set(coalesce(ext, '{}'::jsonb), '{route_aliases}', '["europa-league"]'::jsonb) where id = 'a8408beb-72fb-48b1-b53b-e6d923f045e1' and coalesce(locked, false) = false;
update competitions set name = 'Coupe du monde des clubs' where id = 'a0054e6d-a206-48f2-a2f8-b70664d27987' and coalesce(locked, false) = false;
update competitions set name = 'Coupe intercontinentale' where id = 'd7599ceb-adc2-409f-a6f9-52a034e3e62d' and coalesce(locked, false) = false;
update competitions set name = 'First League (Bulgarie)' where id = 'a9cca3ce-a63a-4bb9-a909-1cbb1b8a9a2a' and coalesce(locked, false) = false;
update competitions set name = 'Matchs amicaux' where id = '07744128-db63-4753-9d0c-1705fc871cb1' and coalesce(locked, false) = false;
update competitions set name = 'Matchs amicaux de clubs' where id = '752813fc-1aaa-4670-b390-b5d029a3275d' and coalesce(locked, false) = false;
update competitions set name = 'Matchs amicaux féminins' where id = '55697857-80bd-4311-929e-fce9ee617184' and coalesce(locked, false) = false;
update competitions set name = 'Coupe de la Ligue (Angleterre)' where id = '60237a76-6e9b-4e0b-bdf9-6bdfda34ab94' and coalesce(locked, false) = false;
update competitions set name = 'Coupe de la Ligue (Écosse)' where id = '5923df5e-03c7-447a-8313-6a09a35d3518' and coalesce(locked, false) = false;
update competitions set name = 'Coupe de la Ligue (Finlande)' where id = '801d59f5-7b27-4b87-839b-cab10dc26f02' and coalesce(locked, false) = false;
update competitions set name = 'Liga I (Roumanie)' where id = 'a2c0be9a-ade8-482a-9ba4-809c5e2f6b59' and coalesce(locked, false) = false;
update competitions set name = 'Liga II (Roumanie)' where id = '8733aa78-70a3-4550-883a-71956f6fb586' and coalesce(locked, false) = false;
update competitions set name = 'Jeux olympiques' where id = 'e15df756-6fbf-436a-a531-f7248b2de002' and coalesce(locked, false) = false;
update competitions set name = 'Premier League (Angleterre)' where id = '25323437-7d51-4a42-9e7f-98e521be2011' and coalesce(locked, false) = false;
update competitions set name = 'Premier League (Russie)' where id = '40545485-0127-49fc-b1c7-8f5d4eec068e' and coalesce(locked, false) = false;
update competitions set name = 'Premiership (Écosse)' where id = '047a560d-fc06-41b7-ab0f-2ff65e56bc6e' and coalesce(locked, false) = false;
update competitions set name = 'Pro League (Émirats arabes unis)' where id = 'f787298c-690d-474f-9409-69ab2630c7c3' and coalesce(locked, false) = false;
update competitions set slug = 'pro-league', ext = jsonb_set(coalesce(ext, '{}'::jsonb), '{route_aliases}', '["jupiler-pro-league"]'::jsonb) where id = '72bd27e6-04d2-4aa9-b6d7-622efbdb611f' and coalesce(locked, false) = false;
update competitions set name = 'Pro League (Arabie saoudite)' where id = 'e7f4e837-c2b3-4a0f-983e-5436705e7c69' and coalesce(locked, false) = false;
update competitions set name = 'Second Amateur Division - Play-offs' where id = '170ed84f-318e-42fd-a467-b3c5db7ecd60' and coalesce(locked, false) = false;
update competitions set name = 'Second Division (Qatar)' where id = '622979a4-e703-4865-a284-c218a057e2d8' and coalesce(locked, false) = false;
update competitions set name = 'Second League (Bulgarie)' where id = '348a5ab0-dc94-459d-9d45-c0a5dddae73f' and coalesce(locked, false) = false;
update competitions set name = 'Serie A (Brésil)' where id = '77d18c7c-83a2-46b9-9d25-e0f9c44b1e85' and coalesce(locked, false) = false;
update competitions set name = 'Serie A (Italie)' where id = 'df241a60-931d-4e97-9d8b-17f0a9da6db5' and coalesce(locked, false) = false;
update competitions set name = 'Serie B (Italie)' where id = '02ac16ce-d42a-44c5-9aa7-bed8888a162c' and coalesce(locked, false) = false;
update competitions set name = 'Coupe d''État (Israël)' where id = 'ec5a5a71-74d8-48ca-94c1-a397fc56e6cd' and coalesce(locked, false) = false;
update competitions set name = 'Supercoupe (Portugal)' where id = '8339e083-a22f-4eb2-a16b-92986006fcc3' and coalesce(locked, false) = false;
update competitions set name = 'Supercoupe (Allemagne)' where id = '7802f5eb-c672-4a74-8f7d-9af1a6c3cbc7' and coalesce(locked, false) = false;
update competitions set name = 'Supercoupe (Pays-Bas)' where id = '11fe59c9-e567-4b7e-885c-ecab39119156' and coalesce(locked, false) = false;
update competitions set name = 'Supercoupe' where id = '27c6344e-045a-4756-9778-50fb6466e25b' and coalesce(locked, false) = false;
update competitions set name = 'Supercoupe (Turquie)' where id = 'e7e7dd4f-af74-4fa7-aef2-8e79fb70b9c8' and coalesce(locked, false) = false;
update competitions set name = 'Supercoupe (Arabie saoudite)' where id = 'a58f06a5-6c10-449c-a00b-b34645dd68f3' and coalesce(locked, false) = false;
update competitions set name = 'Supercoupe (Espagne)' where id = '3fd99569-5b45-492b-aeac-01245a2ce15e' and coalesce(locked, false) = false;
update competitions set name = 'Supercoupe (Italie)' where id = '63e8580f-c12a-4c7e-ad0f-8b28c6ee268f' and coalesce(locked, false) = false;
update competitions set name = 'Super League (Suisse)' where id = 'abb0d37f-2c92-4dfd-839e-a8eaca3ac936' and coalesce(locked, false) = false;
update competitions set name = 'Super League 1 (Grèce)' where id = 'df5b3c6c-9e94-4791-8e16-93272fb072c2' and coalesce(locked, false) = false;
update competitions set name = 'Super Liga (Serbie)' where id = 'bb843e48-1954-40e7-ac57-cf7fa53f6535' and coalesce(locked, false) = false;
update competitions set name = 'Super Liga (Slovaquie)' where id = '1fe30403-3628-4f5e-9321-2ba4327c87b4' and coalesce(locked, false) = false;
update competitions set name = 'Superliga (Danemark)' where id = 'c054ff41-907e-4d24-80fb-d55b26ac5304' and coalesce(locked, false) = false;
update competitions set name = 'Ligue des nations', slug = 'ligue-des-nations', ext = jsonb_set(coalesce(ext, '{}'::jsonb), '{route_aliases}', '["international-5","uefa-nations-league"]'::jsonb) where id = 'e45452a9-10cd-41f2-b42a-550af99f71c4' and coalesce(locked, false) = false;
update competitions set name = 'Supercoupe d''Europe' where id = 'f25d5224-0b52-44a4-8e01-c7adfca7318d' and coalesce(locked, false) = false;
update competitions set name = 'Euro U17' where id = '432ebf48-29c4-4a87-b848-af514b6ddf35' and coalesce(locked, false) = false;
update competitions set name = 'Qualifications Euro U17', slug = 'qualifications-euro-u17', ext = jsonb_set(coalesce(ext, '{}'::jsonb), '{route_aliases}', '["international-886","uefa-u17-championship-qualification"]'::jsonb) where id = '93595258-fa4b-4c42-8816-acce6c10c8b2' and coalesce(locked, false) = false;
update competitions set name = 'Euro U19' where id = '91fd0235-e337-4aa4-b0b4-41840e4b7db2' and coalesce(locked, false) = false;
update competitions set name = 'Qualifications Euro U19', slug = 'qualifications-euro-u19', ext = jsonb_set(coalesce(ext, '{}'::jsonb), '{route_aliases}', '["international-893","uefa-u19-championship-qualification"]'::jsonb) where id = '924bf5ce-9a40-4b19-b841-29277a4df930' and coalesce(locked, false) = false;
update competitions set name = 'Euro U21' where id = '653d4918-d4b5-4846-a7db-0ea044863c44' and coalesce(locked, false) = false;
update competitions set name = 'Qualifications Euro U21', slug = 'qualifications-euro-u21', ext = jsonb_set(coalesce(ext, '{}'::jsonb), '{route_aliases}', '["international-850","uefa-u21-championship-qualification"]'::jsonb) where id = '3e49b1c0-511b-4714-9272-a881051da944' and coalesce(locked, false) = false;
update competitions set name = 'Ligue de la jeunesse de l''UEFA' where id = 'efce9f74-f40d-49e9-8a97-47dea0ea469b' and coalesce(locked, false) = false;
update competitions set name = 'Coupe du monde' where id = 'c952b7b9-2c25-40aa-a655-0a8dadfaaebd' and coalesce(locked, false) = false;
update competitions set name = 'Qualifications Coupe du monde (Afrique)' where id = '499ab0b6-adfd-4a5d-b29f-ee0f91a2673f' and coalesce(locked, false) = false;
update competitions set name = 'Qualifications Coupe du monde (Asie)' where id = '94d12333-c5ed-4740-ac62-e3bb762549cf' and coalesce(locked, false) = false;
update competitions set name = 'Qualifications Coupe du monde (CONCACAF)' where id = 'ddfe5814-31b3-47bb-aebc-bceda0e3b2ee' and coalesce(locked, false) = false;
update competitions set name = 'Qualifications Coupe du monde (Europe)' where id = '70ff746b-eff8-4ecc-b15c-6897c42bf00d' and coalesce(locked, false) = false;
update competitions set name = 'Barrages intercontinentaux de la Coupe du monde' where id = '449eefc7-d8ff-43b2-957d-c396f669a20e' and coalesce(locked, false) = false;
update competitions set name = 'Qualifications Coupe du monde (Amérique du Sud)' where id = 'fd409380-9e6a-4e40-96c4-42420ae5ccc3' and coalesce(locked, false) = false;
update competitions set name = 'Coupe du monde U17' where id = 'd7088941-8ca5-4d6f-aa3d-c3724d44ba2b' and coalesce(locked, false) = false;
update competitions set name = 'Coupe du monde U20' where id = 'f3d29f8d-30d1-45be-ba79-cb896a3e8c3e' and coalesce(locked, false) = false;

-- Croky Cup enregistrée comme championnat (audit du 27/10/2026) : c'est une coupe.
update competitions set competition_type = 'cup' where provider = 'apifootball' and external_id = '147' and competition_type = 'league' and coalesce(locked, false) = false;

commit;

-- Contrôle : compétitions visibles, nom et adresse.
select name, slug, ext->'route_aliases' as anciennes_adresses from competitions where public_visible is distinct from false order by name;
