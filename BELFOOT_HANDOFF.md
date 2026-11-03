Warning: truncated output (original token count: 71135)
Total output lines: 2839

### 03/11/2026 — Fins de contrat dans les transferts

- Affichage : rapprochement prudent de la sortie « nom du joueur » et d'une destination unique API-Football dans les 90 jours, pour un même joueur et club d'origine. Si plusieurs dates sont fournies pour cette destination, elles restent à confirmer. Les cas ambigus, les prêts et les lignes manuelles sont préservés.
- Les données en base ne sont ni fusionnées ni supprimées. Les résultats Rits et Verschaeren fournis par l'utilisateur sont couverts par des tests ; cette règle ne résout pas tous les doublons possibles. Pas de synchronisation de production.

### 02/11/2026 — Bandeau et carte des Belges à l’étranger

- Sur desktop, suppression du portrait agrandi dans le bandeau par défaut : deux prochains matchs connus sont mis en avant, avec liens et joueurs concernés. Le bandeau personnalisé avec image reste pris en charge ; sans matchs, un message neutre s’affiche. À la demande de l’utilisateur, la carte reste bien visible mais perd ses encadrements rectangulaires et son fond carré ; elle est intégrée au fond de page, avec un panneau discret des pays filtrant l’annuaire sur grand écran. Sur mobile, ce classement latéral est masqué.
- Aucun changement de synchronisation, SQL ou données ; aucun appel API-Football. Tests ciblés page : 8 réussis ; ESLint sans erreur, avertissements existants sur images. Vérification visuelle responsive encore nécessaire.

### 02/11/2026 — Performances récentes des Belges : lecture bornée

- PR empilée sur la PR #107 : la migration 0041 ajoute une fonction PostgreSQL SECURITY INVOKER limitée à 80 joueurs suivis et actifs, 5 matchs par joueur et 45 jours, dédoublonnés par match et sans sélections. L’index existant (player_id,match_id) sert au filtrage. Le client découpe les listes par 80 ; si la fonction est absente (PGRST202), repli sur l’ancienne requête de 500 lignes avec mention visible. Les autres erreurs sont remontées.
- Le 02/11/2026, l’utilisateur a exécuté la migration 0041 dans Supabase et a confirmé « success ». L’utilisateur a ensuite confirmé en lecture seule que la fonction et son enregistrement existent tous deux (true, true) ; aucun appel API-Football ou synchronisation n’a été lancé par cette migration. En l’absence de migration, les données restent partielles. Tests réels PostgreSQL PGlite et repli client ; 934 tests locaux réussis sur cet environnement. Les temps d’exécution sur le volume réel et les politiques RLS production restent à vérifier avant généralisation.

### 02/11/2026 — Page Belges à l’étranger : première amélioration

- Accès rapide à l’annuaire, filtres réinitialisables et cohérents, recherche sans accents, noms de pays avec tirets traduits, listes de ligues et profils repliées, compteurs masqués en chargement ou erreur. Les chargements de clubs en erreur ne sont plus silencieux. L’adversaire d’une performance est établi à partir du club de la performance et non du club actuel.
- La sélection « En forme » exige un match enregistré depuis moins de 45 jours et indique le nombre de matchs disponibles ; le Belge du moment précise la période. Les données peuvent rester partielles : la requête actuelle conserve son plafond global de 500 performances triées par date de synchronisation. Ne pas présenter ces classements comme exhaustifs. À traiter séparément : accès équitable et performant aux derniers matchs, dédoublonnage fiable des championnats et exclusion des coupes, refonte visuelle complète et validation mobile.
- Aucun appel API-Football, changement de données, synchronisation ni migration. Trois fichiers de tests ciblés : 20 tests réussis ; ESLint sans erreur, avec avertissements existants sur les images.

### 2026-11-02 — ChatGPT — reprise des entraîneurs après échec

- Diagnostic transmis par l’admin : le 28 octobre plusieurs jobs entraîneurs ont échoué sur le quota API ; l’ancien cron effaçait le lot de reprise et considérait l’échec comme une vérification hebdomadaire. Le cron conserve désormais le dernier lot confirmé et réessaie après 24 h, y compris les anciens états d’erreur. Les autres compétitions restent éligibles pendant l’attente.
- L’API a également renvoyé le 2 novembre un mandat de Leko toujours ouvert à Gand (id 1153), tandis qu’une autre fiche Leko existe à Bruges (id 25726). Le simple rafraîchissement ne garantit pas une correction : identité et mandats doivent être vérifiés ; aucune fiche n’a été fusionnée ou corrigée en production par cette PR. Les dates des autres fiches et les erreurs du 28 octobre ne suffisent pas à attribuer chaque fiche obsolète à ces erreurs.
- Aucun SQL ni appel API lancé par ce changement. La reprise automatique consommera des appels après déploiement ; une correction manuelle protégée et vérifiée peut rester nécessaire si le provider est inexact.

- Le 02/11/2026, l’admin a confirmé dans Supabase trois fiches manuelles protégées : Vítor Bruno (Anderlecht), Rik De Mil (La Gantoise) et Mario Kohnen (Charleroi), établies après vérification sur les sites des clubs. Les fiches API précédentes restent en base. Les synchronisations ignorent ces trois clubs tant que la protection est active : suivre et modifier manuellement ces affectations en cas de changement.

# BELFOOT — Passation technique

## 02/11/2026 — Statistiques de match

- PR #104 : lignes plus compactes, chiffres et libellés plus lisibles, barres centrées cyan/rose et équipes identifiées. Les données manquantes restent distinctes des zéros. Rendu mobile et desktop à vérifier ; voir la PR pour la CI et le déploiement.
- L'utilisateur signale plusieurs entraîneurs périmés en Pro League : Leko à Gand et Hasi à Anderlecht. Audit global à poursuivre ; pas de modification de données sur la base de ces seuls exemples.

## 02/11/2026 — Collision de synchronisations d'historiques

- Capture utilisateur : pipeline `jpl-history` en erreur « Ce job est déjà en cours pour cette sélection » à 1348/1545 appels ; carte cron 76/634 et quota observé environ 5923. État au moment de la capture, à recontrôler. Deux autres pipelines en erreur de budget insuffisant sont indépendants ; ne pas les relancer sans diagnostic.
- Cause dans le code : l'index de job actif empêche bien les exécutions concurrentes mais une collision retourne une erreur ordinaire, interrompant le pipeline. PR proposée : code d'erreur typé et pause de 2 minutes pour division-history, avec plafond de 5 collisions consécutives et maintien du budget ; tests ciblés 84/84. Ne pas désactiver les verrous, ne pas créer de pipeline doublon ; vérifier avant reprise la cible, le budget restant et les tâches actives.
- L'utilisateur souhaite des statistiques de match plus compactes et lisibles, inspirées de sa capture API-Football, sans copie ; Leko à Gand reste à diagnostiquer. PR #99 de compteur global encore en attente.

## 02/11/2026 — Match Center

- PR #102 : compositions et statistiques du direct actualisées via notifications et repli périodique, actualisation manuelle étendue, affichage prudent des données manquantes et événements sans équipe centrés. Vérifier en conditions réelles la couverture Realtime et la charge ; aucun appel API-Football depuis le navigateur. Voir la PR pour les vérifications et l'état du déploiement.
- L'utilisateur souhaite ensuite une refonte visuelle de la fiche match et des couleurs ; cette PR ne la réalise pas.

## 02/11/2026 — Fiche club

- PR #101 : logo du club en filigrane, aperçu de saison conditionné aux sections administrables (classement calculé, effectif et année, prochain match programmé) ; test visuel à effectuer, CI et déploiement à consulter sur la PR.
- L'utilisateur signale I. Leko à Gand ; une ancienne fiche API distincte (1153) reste liée à Gand alors qu'une autre est liée à Bruges. Recherche « De Mil » sans résultat selon l'utilisateur ; la synchronisation club n'a pas corrigé l'affichage. Rechercher la cause fournisseur et les journaux avant modification des données.

## 02/11/2026 — Présentation des fiches joueurs

- PR de présentation : navigation Vue d'ensemble / Statistiques / Parcours / Matchs ; portrait mobile légèrement plus compact. Elle inclut le correctif de la PR #97 : exclusion des matchs amicaux et doublons du résumé et indication de la saison. Aucun changement de synchronisation ou de données.
- Tests ciblés 25/25 ; vérification visuelle mobile et ordinateur toujours nécessaire (aperçu local `sites-preview` incompatible avec l'option `--host` de Next.js). Voir PR pour CI et déploiement.
- Historiques : l'utilisateur a repris le lot avec 1 000 appels additionnels et a observé 22/634 ; la PR #99 corrige le compteur partiel, son résultat en production reste à vérifier. La PR #98 est fusionnée et déployée (`36a793e`).
- Diego Moreira apparaît désormais parmi les Belges à l'étranger selon l'utilisateur ; sa double nationalité belge et portugaise reste à contrôler sur sa fiche.

## 02/11/2026 — Timeout du rattrapage des historiques

- L'utilisateur a observé 37/634 joueurs vérifiés, puis `FUNCTION_INVOCATION_TIMEOUT` sur le pipeline manuel Pro League à budget 500. L'état exact du pipeline et la réconciliation effective en production ne sont pas encore vérifiés. Le progrès durable par saison et les compteurs d'appels sont conçus pour permettre la reprise ; ne pas présumer que la dernière étape interrompue est terminée ni créer un doublon de pipeline.
- Correctif proposé sur une PR séparée : chaque invocation du pipeline division-history a une échéance mesurée dès l'entrée de la route (25 s), 3 appels maximum par lot, délai fournisseur 6 s ; budget global conservé. Lot sans progrès faute de temps : reprise différée pour éviter une boucle rapide. Les délais DB et fournisseur peuvent encore dépasser les marges ; validation en production nécessaire après accord. Tests ciblés 23/23.
- PR #97 de fiche joueur reste distincte. L'utilisateur a confirmé que Diego Moreira apparaît désormais parmi les Belges à l'étranger ; il précise aussi que Diego a les nationalités belge et portugaise (mise à jour de sa fiche non confirmée).

## 02/11/2026 — Diego Moreira

- Diagnostic en base communiqué par l'utilisateur : `D. Moreira` (API 335056) actif et suivi, nationalité Portugal, sélection Belgique, club AC Milan ; naissance absente. L'annuaire écartait les joueurs sans nationalité/naissance/suivi binational belge AVANT de consulter leur sélection, et `belgianWatchStatus` rejetait également ces joueurs avant d'examiner l'équipe nationale.
- PR dédiée : la sélection belge explicite est reconnue comme lien suffisant, sans réécrire la nationalité ; annuaire et accueil chargent la sélection avant le filtre. Tests ciblés 23 réussis, ESLint ciblé sans erreur. Statut de la PR et CI à vérifier sur GitHub ; aucun changement de données et aucune synchronisation lancée pour ce diagnostic.
- Suivi historiques : PR #94 fusionnée et en production, migration et cron installés et confirmés ; premier passage manuel 5 étapes / 5 appels, 0/634 joueurs complets, quota 7360. Le résultat du lot de rattrapage demandé de 500 appels reste à confirmer.
- Freddie Potts : PR #95 fusionnée et déployée (`2fa46bb`) ; le propriétaire a rattaché West Ham U21 à West Ham. Vérification visuelle du doublon restant à confirmer.

## 02/11/2026 — Historiques et transferts

- PR #94 fusionnée (`137bb0b`), production Vercel READY ; migration 0040 confirmée et contrôlée par l'utilisateur. Cron `belfoot-jpl-history` installé et actif, réglage activé. Premier passage manuel : 5 étapes, 5 appels, quota 7360, 0/634 joueurs entièrement vérifiés ; rattrapage manuel 500 appels lancé ou en cours, résultat à confirmer.
- Freddie Potts : 3 lignes API pour la même arrivée à Bruges les 2–3 août 2026, départ West Ham ou West Ham U21. Le propriétaire a renseigné et confirmé dans Supabase le lien `parent_club_id` West Ham U21 → West Ham le 02/11/2026 ; aucun transfert ni joueur n'a été supprimé ou déplacé. Correctif d'affichage proposé dans la PR dédiée : seuls les liens parent explicites servent au regroupement ; aucun transfert supprimé.

## Historiques automatiques Pro League — PR #94 en brouillon (02/11/2026)

- Branche `feat/automated-player-history`, PR https://github.com/Max7800/Belfoot/pull/94 ; base `main` `c518d048`, code vérifié sur `cee7bab`. CI GitHub réussie : 926 tests, lint sans erreur (121 avertissements), build réussi avec Supabase fictif. Recontrôler les vérifications sur le dernier commit avant toute fusion.
- Aperçu Vercel du commit `cee7bab` : compilation réussie puis échec lors de la préparation de `/sitemap.xml` : `supabaseUrl is required` ; `NEXT_PUBLIC_SUPABASE_URL` absente pendant ce build Preview. Cela ne vérifie pas l'environnement Production ni le fonctionnement en conditions réelles. L'utilisateur accepte de ne pas bloquer l'avancement sur l'aperçu visuel.
- Le déploiement Preview utilise Node 26 malgré le réglage Vercel 24, à cause de `engines.node >=20.9.0` dans `package.json` ; vérifier la compatibilité de l'environnement de production avant mise en service.

- Périmètre : joueurs de la Pro League API-Football 144 de la saison publique, toutes nationalités, y compris les joueurs transférés pendant la saison. Les affectations `player_team_seasons` sont dédupliquées ; effectifs absents, fiches sans identifiant et clubs incomplets restent signalés.
- Parcours en club puis cinq saisons précédant la saison courante, toutes compétitions fournies par le fournisseur. Les données absentes de l'API ne sont pas inventées. Les affectations existantes et verrouillées sont préservées. L'import d'effectif conserve les joueurs transférés sans leur réattribuer leur ancien club courant.
- `0040_player_history_work` : état indépendant par joueur et saison (saison 0 = parcours), succès existants repris depuis les marqueurs valides, prise atomique par jeton, bail de 5 minutes et nouvelle tentative différée de 2 h après erreur. Les pipelines Belges et Pro League utilisent le même état. Les mutations de marqueurs sont fusionnées côté base sans réécrire tout `players.ext`.
- Un cron distinct `/api/cron/jpl-history` exécute au maximum 5 appels d'historique par heure. Une vérification hebdomadaire de l'effectif traite un club par passage, avec au plus 4 appels supplémentaires et reprise par index. L'automatisation est désactivée par défaut ; le panneau Synchronisations affiche l'état et permet son activation explicite. Ce même réglage active aussi l'élargissement automatique aux cinq saisons des Belges à l'étranger. Le pipeline manuel `jpl-history` conserve budget, préflight et reprise. « Vérifié » signifie que l'API a répondu pour les étapes, y compris lorsqu'elle ne fournit pas de statistiques.
- **Migration `0040`** : exécutée manuellement dans Supabase par l'utilisateur, qui a confirmé son succès le 02/11/2026 ; statut rapporté par l'utilisateur, non vérifié directement en base. Aucun lancement de synchronisation ni installation du cron n'a été réalisé dans cette session. Vérifier la cible et la CI, puis obtenir l'accord explicite avant fusion ; installer séparément `supabase/jpl_history_cron_setup.sql` et activer l'automatisation seulement après accord pour la synchronisation. Contrôler la couverture et le quota avant le premier passage.
- Diego Moreira, le doublon Freddie Potts et les améliorations visuelles des fiches restent des chantiers séparés.

## Roadmap des synchronisations — 8 PR (audit du 12/10/2026, Claude)

Audit complet des synchronisations (lecture seule) puis plan validé avec l'utilisateur : **une seule PR à la fois, feu vert explicite à chaque étape**. Les boutons de synchronisation contextuels (fiches compétition, club, joueur) sont conservés ; le futur panneau central les complète sans les remplacer.

1. **Collisions de compétitions — TERMINÉE** (PR #9, merge `e73e485`, déployée en production le 12/10). `ensureCompetitions` lève `CompetitionCollisionError` (slug ou identifiant ambigu) au lieu d'ignorer l'erreur d'unicité ; `syncNationalTeam` s'arrête avant toute écriture ; `runJob` enregistre `params.error_code` ; le cron `national-refresh` ne relance plus une sélection en collision avant l'intervalle normal (4 h en rassemblement, 20 h sinon). Aucune migration. Vérification de production avant fusion : 0 collision.
2. **Pipelines abandonnés ou bloqués — TERMINÉE** (PR #10, merge `2369129`, déployée en production le 13/10). Complément **PR 2b** (branche `fix/lease-lost-propagation`) : la perte de bail n'est plus avalée par les appels facultatifs. Voir ci-dessous.
3. **Périmètre explicite des jobs — TERMINÉE** (PR #12, merge `78f7d53`, déployée en production le 13/10). Chaque job déclare ses périmètres dans `JOB_CATALOG` (`scopes` : `competition`, `national`, `live`, `none`, `global`) ; `lib/jobScope.js` (`resolveJobScope`) les valide dans `runJob` AVANT le préflight : un job ciblé sans identifiant est refusé sans lecture, sans écriture ni appel API. Le périmètre `global` n'est accepté que pour un pipeline déclaré `globalScope` (découverte « monde ») ; le préflight ignore désormais tout `globalScope` envoyé par le client. Défense en profondeur : les jobs `sync`, `squads`, `events`, `coaches`, `track-belgians`, `transfers`, `player-careers`, `lineups` et `discover-belgians` refusent eux-mêmes l'absence de compétition (`requireCompetitionId`) au lieu de tout parcourir ; `live-sync` sans compétition reste limité aux compétitions `live_enabled`. Le verrou `job_runs.target_key` suit le périmètre (`team:<id>` pour une sélection même si une compétition est sélectionnée dans l'admin ; `live`, `none`, `global` au lieu de `all`). Aucune migration.
4. **Carte « Prochaine journée » — TERMINÉE** (PR #13, merge `a0bd72b`, déployée en production le 13/10). Règle unique `lib/matchdays.js` (`nextMatchday`, `upcomingMatches`, `isSeasonOver`), harmonisée avec `isMatchOver` (même délai de 3 h). Une journée est **entamée** dès qu’un de ses matchs est joué, en direct, interrompu ou que son coup d’envoi est passé ; la carte montre alors la journée **complète** suivante (matchs reportés compris, triés par date), le reliquat restant visible dans la carte des résultats. La prochaine journée est la première, **par date**, sans aucun match entamé et avec au moins un match à venir. Ne retiennent jamais la carte : match reporté sans date (`PST`), annulé, abandonné, acté (`CANC`, `ABD`, `AWD`, `WO`), direct bloqué ou match programmé jamais mis à jour au-delà de 3 h après son coup d’envoi. Sans journée numérotée (coupes) ou après la dernière journée : les 10 prochains matchs réellement à venir. « Saison terminée » = chaque match joué (`isMatchOver`) ou annulé, et non plus seulement `status = finished`. Affichage uniquement : aucune synchronisation, aucune migration.
5. **U21 (ligue 850) — code TERMINÉ** (PR #14, merge `bf52c1e`, déployée en production le 14/10) ; préparation de l'import TERMINÉE (PR #15, merge `6c76d01`, 16/10) ; affichage des groupes réels TERMINÉ (PR #16, merge `858fdd4`) ; opérations U21 de production TERMINÉES le 18/10 (journal ci-dessous). Objectifs : tous les matchs de la compétition, classements officiels des groupes, une saison par campagne (aucune saison artificielle), pas de tableau à élimination injustifié. Code d'abord ; imports et réparations de production séparés, sur autorisation. Voir « PR 5 » ci-dessous.
6. **Identité des joueurs et « Synchroniser ce club » — identité TERMINÉE** (PR #24, merge `8e90b90`) ; **« Synchroniser ce club » TERMINÉE** (PR #25, merge `4761354`, voir « PR 6b ») : noms et photos corrigés à la main protégés (`ext.editorial_fields`) ; compétitions homonymes distinguées sans renommage ; action ciblée sur un club (effectif, entraîneur, matchs de la saison choisie).
7. **Façade commune et panneau central** — **panneau en lecture seule TERMINÉ** (PR #26, merge `8ecc122`, voir « PR 7a ») ; **correctif statistiques TERMINÉ** (PR #27, merge `87869bf`, premiers lots vérifiés en production le 25/10 à 20:00 UTC) ; **façade TERMINÉE** (PR #28, merge `c59fa20`, voir « PR 7b »).
8. **Garde-fous d'administration — TERMINÉE** (PR #29, merge `d7dd058`, voir « PR 8 ») : modifications de `external_id`, suppressions de compétitions et écritures concurrentes de `site_settings` confirmées et auditées.

### Audit visiteur (26/10) — lectures publiques complètes (PR A)

- **Constat** : Supabase plafonne chaque lecture à 1 000 lignes sans erreur. Pages de compétition : stats de saison lues à 1 000 sur 1 723 (C1) / 1 754 (C4) / 1 180 (Ligue des nations) ; performances par match lues par paquets de 150 matchs, chaque paquet tronqué (jusqu'à 4 100 lignes, Pro League comprise) ; affectations des coupes d'Europe 1 000 sur 2 504 (C1) / 2 375 (C3) / 4 853 (C4) (« 1000 joueurs ») ; portail des compétitions : type deviné sur 1 000 matchs seulement ; fiche club « Belgium » : 1 513 joueurs.
- **Correctif** : `lib/readAll.js` (pages de 1 000 = plafond Supabase par défaut, ordre stable par `id`, même forme `{ data, error }`, plafond de sécurité 50 000) appliqué aux lectures à risque : page compétition, portail, fiche club, Diables, transferts de compétition, lecteurs par paquets (`lib/publicFootballData.js`), vote de la semaine. Un test parcourt les pages publiques : toute lecture de `player_team_seasons` / `player_season_stats` / `match_player_stats` passe par `readAll` ou est bornée (une entité, une limite).
- Si le plafond Supabase (« Max rows ») est un jour modifié, ajuster `READ_PAGE_SIZE`.
- **Suivi après la PR #37** : la page Ligue des champions (désormais ~35 lectures complètes) a affiché par intermittence « canceling statement due to statement timeout » (délai d'exécution de la base dépassé, surtout quand le cron écrit), et toute la saison tombait à zéro. Correctif : `readAll` réessaie une page en dépassement de délai (PostgreSQL 57014, 2 nouveaux essais avec pause croissante) ; lecteurs par paquets via `readChunks` (au plus 3 paquets en vol au lieu d'une rafale de 17). Test de charge (3 navigateurs simultanés, aperçu local branché sur la production) : dépassements de délai rencontrés puis absorbés, 2 504 joueurs affichés à chaque chargement.
- Vérifié sur aperçu local branché en lecture seule sur la production : C1 2 504 joueurs, C3 2 375, C4 4 853 (au lieu de 1 000). Tests : `tests/football/publicReads.test.js` (6 ; 3 échouent sur l'ancien code).
- Suite de l'audit : règles d'affichage (club actuel ≠ sélection, un seul « ACTUEL », français), nettoyage SQL (club_id → sélection 1 513, pays « World » 1 718, affectations, doublons de transferts, 36 noms mal encodés), enrichissements des pages club et joueur.

### Titres, aperçus de partage et adresse du site (26/10)

- **Constat** : toutes les pages s'appelaient « Belfoot » (pages rendues côté navigateur, sans métadonnées) ; `robots.txt` et le sitemap annonçaient le domaine factice « a-definir.be » (`siteConfig.domain`), et les canoniques des pages légales aussi ; titres des pages légales en double (« … · Belfoot · Belfoot »).
- **Adresse** : une seule source, `lib/siteUrl.js` — `SITE_URL` (facultatif) → `VERCEL_PROJECT_PRODUCTION_URL` (adresse de production du projet, fournie par Vercel) → `VERCEL_URL` → local. Aucun domaine écrit en dur (test). `siteConfig.domain` = null.
- **Indexation FERMÉE** tant que le site n'a pas son domaine (décision utilisateur, 26/10) : `siteConfig.seo.indexable = false` → `noindex, nofollow` sur toutes les pages, `robots.txt` sans sitemap (exploration permise pour que les robots lisent la consigne). Compétition masquée : toujours `noindex`.
- **Métadonnées par page** (layouts serveur, lecture publique `lib/publicServerClient.js`, repli générique en cas d'erreur) : joueur (« J. Mokio — Ajax », poste · club · nationalités en français, photo), club (pays, logo), compétition (nom + saison par défaut, bannière), match (« Gent 2-1 Club Brugge » ou « Gent – Club Brugge », compétition, date). Sections (Compétitions, Diables Rouges, Belges à l'étranger, Classements, Direct, 11 de la semaine, Le Noyau, Recherche, Proposer, Matchs) : `sectionMetadata` — titre et modèle « … · Belfoot » transmis aux sous-pages, sans canonique (une sous-page ne se déclare pas doublon).
- **Le jour du domaine** (aucune ligne de code à changer pour l'adresse) : 1) brancher le domaine dans Vercel comme domaine de production (l'adresse suit automatiquement) ; 2) `config/site.js` : `seo.indexable: true` ; 3) Supabase → Authentication → URL Configuration : Site URL + redirections vers le domaine ; 4) rediriger l'ancienne adresse .vercel.app vers le domaine (301, réglage Vercel) ; 5) Google Search Console : déclarer le domaine et soumettre `/sitemap.xml`.
- Vérifié sur un aperçu local branché en lecture seule sur la production. Tests : `tests/football/seoMetadata.test.js` (13) ; mutations 10/10.

### Recherche : compétitions (26/10)

- La recherche publique ne trouvait que les actualités, clubs et joueurs (« pro league » : aucun résultat). Nouveau type **Compétitions** (`modules/football/search.js`, `matchingCompetitions`) : compétitions VISIBLES seulement, sans accents (`lib/textMatch.js`, partagé avec les préférences d'affichage de l'admin), sur le nom, le titre du bandeau et le slug (« jupiler » → Pro League) ; portée en sous-titre ; lien par `competitionHref` (homonymes gérés comme partout) ; au plus 10, les masquées ne prennent jamais la place des visibles.
- Vérifié sur les 74 fiches de production (lecture seule) : « pro league » → Challenger Pro League + Pro League (pas la Pro League saoudienne masquée), « conference » → Conférence League, « u21 », « nations » trouvés.
- Tests : `tests/football/competitionSearch.test.js` (8) ; mutations 9/9.

### Renouvellement des campagnes privé par les statistiques (26/10) — PR #33, merge `f3cdbad`

- Constat (lecture seule en production, 26/10 ~15:00 UTC) : aucun renouvellement depuis le 25/10 17:00 alors que les 10 compétitions étaient dues. Depuis la PR #27, le passage statistiques avance des lots à chaque passage (≈ 10–30 s ; C4 135/165, C3 51/76 clubs) avant le renouvellement, qui ne démarre que dans les 12 premières secondes : il n'était plus jamais lancé — y compris pour les compétitions surveillées (PR #32).
- Correctif : renouvellement placé après les résultats et AVANT les statistiques (1 appel le plus souvent) ; les statistiques reprennent leur lot au passage suivant.
- Test : `tests/jobs/campaignRollover.test.js` « des lots de statistiques longs ne privent plus le renouvellement » (échoue avec l'ancien ordre).

### Contrôle qualité du site public (26/10) — PR #34, merge `d943edf`

- Navigation réelle de la production (Edge sans interface, lecture seule, scratchpad `crawl/`) : 26 pages publiques en ordinateur et mobile (390 px) — aucune erreur JavaScript, aucun texte « undefined / NaN / [object Object] / Invalid Date », recherche joueurs et clubs fonctionnelle.
- Corrigés :
  - **Jargon d'administration visible par les visiteurs** (≈ 20 textes : « job plafonné », « migration SQL 0027 », « après la synchronisation », « à compléter dans l'administration », « Import en préparation »…) → textes neutres ; l'indication technique reste visible pour un administrateur connecté via `components/AdminHint.js`.
  - **Page de match** : textes vides selon l'état (à venir / en direct / terminé) ; date du coup d'envoi plus affichée deux fois pour un match à venir.
  - **Page Diables Rouges, mobile** : débordement horizontal de 15 px (4 tuiles « Classement FIFA ») → tuiles 2 × 2 sous 640 px et colonnes `min-w-0` (mesuré 405 → 390 px).
  - **Console** : directive CSP `upgrade-insecure-requests` retirée de la politique Report-Only (ignorée et signalée en erreur sur chaque page ; HSTS impose déjà le HTTPS).
  - **Icône d'onglet** : `app/icon.svg` provisoire (`/favicon.ico` répondait 404) — à remplacer par le logo officiel.
  - **Carte du monde des Belges** : pays tous noirs, sans couleur ni survol depuis sa création — composant écrit pour l'API de react-simple-maps 3 (`style={{ default, hover, pressed }}`) alors que le projet utilise la v5 (attributs SVG ordinaires) ; couleurs en attributs `fill`/`stroke`, survol et clic en CSS (`.bf-geo`). Vérifié sur un aperçu local branché en lecture seule sur la production (clé publique).
  - **Libellés « inconnu »** : « À renseigner », « Championnat à renseigner », « Club à renseigner » → « Pays / Championnat / Club non précisé », constantes partagées (`lib/belgiansAbroad.js`) — la carte ignore exactement le pays inconnu affiché ; en-tête de compétition : pays en français (`frenchNationName`, « Belgium » → « Belgique »).
- Constats laissés à l'administrateur : titre de la page Diables saisi dans l'admin « RED DEVIL'S » (le défaut du code est « Les Diables Rouges ») ; compétitions non cherchables → corrigé (« Recherche : compétitions » ci-dessus) ; aucune violation CSP relevée en Report-Only, passage en mode bloquant envisageable.
- Tests : `tests/football/publicPolish.test.js` (10 ; 6 échouent sur l'ancien code).

### Compétitions surveillées (26/10)

- Besoin : les prochaines échéances (qualifications Euro 2028 [960], phase finale Euro U21 2027 [38], qualifications Coupe du monde 2030 [32], Euro 2028 [4]) sont des fiches masquées jamais importées ; le renouvellement automatique (PR #23) ne traitait que les compétitions visibles déjà importées en entier.
- Case **« Surveiller »** par compétition dans le Plan d'import (`config.watch`, active seulement si « Autoriser ») : le passage 3 du cron `competition-refresh` vérifie aussi les compétitions surveillées (même masquées, même sans saison publiée), 1 appel par jour ; nouvelle campagne → plan, import « Archive résultats », contrôles, **prête en restant masquée**. Publication = geste de l'administrateur (rendre visible, puis activer depuis « Saisons »). Conseil : niveau « Archive résultats » pour les saisons d'une compétition surveillée (sinon les contrôles exigent compositions et statistiques).
- **Défaut corrigé (PR #23)** : un import complet sans aucun match marquait la campagne « importée en entier » ; une saison annoncée par l'API avant son calendrier n'était alors plus jamais réessayée. Une campagne n'est désormais « à jour » qu'avec au moins un match ; sinon statut « en attente » et nouvel essai toutes les 72 h (`WAITING_RETRY_HOURS`).
- **Défaut corrigé** : `hydrateCompetitionConfig` effaçait `auto_rollover: false` (et tout réglage inconnu) à chaque enregistrement du plan depuis le panneau ; `watch` et `auto_rollover` sont conservés.
- Résultat structuré du job (`meta.status` : ineligible, no-campaign, up-to-date, not-prepared, waiting, incomplete, ready), transmis par `runJob` (`meta`) et enregistré dans `football_campaign_rollover_state`. Le cron garde le passage de renouvellement même sans compétition visible à rafraîchir si des compétitions sont surveillées.
- Vue d'ensemble : section « Compétitions surveillées » ; alertes « PRÊTE, compétition non publiée — à publier », « calendrier pas encore publié », « contrôles incomplets », « surveillée mais non autorisée ».
- Tests : `tests/jobs/competitionWatch.test.js` (18), `tests/jobs/campaignRollover.test.js` (24, dont le scénario « importée vide puis calendrier publié ») ; mutations 16/16.

### Pages Synchronisation réorganisées (26/10)

- L'ancienne page « Plan d'import » empilait plan, audit des doublons, entretien des données et activation des saisons (outil de reliaison introuvable sous 70 compétitions dépliées). Elle devient trois pages du menu Synchronisation, sans changement de comportement :
  - **Plan d'import** (`ImportPlanPanel`) : saisons et budget, compétitions et sélections autorisées, ordre quotidien ;
  - **Saisons (activation)** (`SeasonActivationPanel`, clé `season-activation`) : contrôles et activation publique ;
  - **Entretien des données** (`DataMaintenancePanel`, clé `data-maintenance`) : reliaison sans appel API, audit des doublons, inventaire et archivage d'une saison.
- Affichage (préférences de ce navigateur, `lib/adminViewPrefs.js`, jamais écrites dans le plan) : catégories et pays repliables (état mémorisé, Belgique ouverte par défaut), recherche sans accents, « Autorisées seulement », « À traiter seulement », bouton **masquer** sur chaque compétition / sélection (partagé entre Plan et Saisons) avec « Afficher les masquées (N) » ; les masquées encore autorisées sont signalées (elles restent importées).
- Corrigés : compétitions chargées sans `ext` (la catégorie « Étranger » rangeait tout sous « Autre pays ») ; un changement de saison dans l'archivage (choix ou filtre) efface désormais rapport et simulation, pour qu'un archivage ne vise jamais une autre saison que celle analysée.
- Textes « à activer depuis le plan d'import » → « depuis la page Saisons » (vue d'ensemble, renouvellement de campagne).
- Tests : `tests/admin/importPlanSplit.test.js` (13 : chaque action une seule fois et à sa place, confirmations conservées, JSX valide, préférences robustes) ; mutations 12/12.

### PR 8 — garde-fous d'administration (25/10)

**Écritures concurrentes de `site_settings`** (`lib/siteSettings.js`)
- Constat : 14 écrivains (11 panneaux, route des tuiles, cron `competition-refresh` à chaque réussite, job de renouvellement) lisaient tout le JSON puis réécrivaient tout. Une écriture intercalée était perdue sans bruit (ex. plan d'import enregistré pendant un passage du cron, ou complété par le renouvellement pendant qu'un formulaire est ouvert). Deux panneaux (« Textes », « Fiche club — sections ») ignoraient en plus les erreurs.
- `updateSiteSettings(db, patch, { expected })` : révision `_rev` dans le JSON, UPDATE conditionné par la révision lue (`data->>_rev`, IS NULL au premier passage), relecture et réapplication en cas de course (8 tentatives, pause aléatoire croissante) ; chaque écrivain ne remplace que SES clés. `patch` peut être une fonction rappelée sur les données relues (`null` = ne rien écrire). `expected` : refus explicite (`SettingsConflictError`) si la clé a changé depuis l'ouverture du formulaire — plan d'import et stratégie du direct. Statistiques par compétition : fusion par compétition.
- Plus aucun écrivain direct hors `lib/siteSettings.js` (test qui parcourt app/, components/, lib/, modules/).
- **SQL manuel** sur `site_settings` : incrémenter aussi `_rev` : `data = jsonb_set(data || '{...}', '{_rev}', to_jsonb(coalesce((data->>'_rev')::int, 0) + 1))`.
- Validé sur un banc RÉEL (PostgreSQL 17.10 embarqué + PostgREST 14.18 et 13.0.8 officiels, SHA-256 vérifiés, scratchpad `realpg/settings-bench.mjs`) : 7/7 — premier passage IS NULL, révision périmée refusée, 20 écrivains simultanés sans perte, PATCH en attente de verrou réévalué après commit concurrent, réapplication après course, refus de conflit sur la même clé ; témoin : l'ancien schéma ne conserve que 1 écriture sur 20.

**Suppressions et identité fournisseur** (`lib/adminGuards.js`, EntityManager)
- Constats …53135 tokens truncated…on et la même saison. Cela empêche les
  doubles additions comme le `39` affiché pour Bertaccini tout en conservant l'addition de deux clubs
  réellement représentés lors d'un transfert.
- La liste des clubs renvoyée par le provider est désormais mémorisée par saison dans `competitions.ext`.
  Les effectifs et entraîneurs utilisent cette référence en plus des clubs dérivés des matchs : une
  simulation Pro League 2026/2027 estime donc bien 18 clubs même si seulement 17 sont encore visibles
  avant l'étape de base. Si la synchronisation ne ramène toujours pas les 18 clubs, les étapes suivantes
  sont bloquées afin d'éviter de valider silencieusement une saison incomplète.
- L'import de base ne fait plus une lecture puis une écriture Supabase séquentielle pour chacun des
  quelque 306 matchs : les existants sont chargés par groupes, les nouvelles lignes sont insérées par
  lots et les mises à jour utilisent une concurrence bornée. L'enrichissement des stades est également
  groupé. Cela vise directement les `FUNCTION_INVOCATION_TIMEOUT` de `football.sync` sur Vercel Hobby ;
  une coupure brutale ne peut pas déclencher la continuation automatique côté navigateur.
- Le contrôle de préparation compte les affectations via `season_start_year` : les effectifs enregistrés
  sous la valeur technique `2026` sont correctement rattachés au libellé public `2026-2027`, sans nouvel
  import.
- Le pipeline admin `✅ Compléter la saison` draine uniquement les matchs terminés dont un marqueur manque :
  événements par lots de 15, puis compositions, statistiques joueurs et statistiques collectives par lots
  de 3. L'admin enchaîne les lots automatiquement ; progression, coût et étape survivent à un rechargement.
  Un timeout laisse les marqueurs déjà écrits intacts, et une reprise repart des seuls endpoints manquants.
  Si l'enveloppe explicite (maximum 500 appels par lancement/reprise) est atteinte, le pipeline se met en
  pause sans erreur et demande une nouvelle enveloppe. Les pipelines hebdomadaires restent plafonnés et ne
  drainent pas accidentellement tout l'historique. Aucun SQL supplémentaire n'est nécessaire.
- Le choix de saison dans `Jobs & historique` est une liste déroulante : elle propose les saisons déjà
  présentes pour la compétition et conserve toujours les trois cibles 2024-2025, 2025-2026 et 2026-2027.
- Les attentes clubs/matchs du plan d'import sont désormais définies **par saison** (plan version 4),
  car les formats changent réellement. Valeurs Challenger intégrées : 16/240 en 2024-2025, 17/272 en
  2025-2026 et 15/210 en 2026-2027. Le vieux plan version 3 est interprété correctement côté serveur
  avant même son réenregistrement ; l'admin propose ensuite d'enregistrer les nouvelles valeurs. Les
  15 clubs Challenger déjà importés en 2026-2027 sont donc valides et ne doivent pas être resynchronisés.
- Lorsqu'un nombre de participants est réellement inférieur à l'attente, le préflight liste désormais
  les clubs détectés. Dans `Jobs & historique`, une seule reprise est affichée par pipeline/cible afin
  de ne plus présenter plusieurs anciennes tentatives identiques. Aucun SQL n'est nécessaire.

#### État à récupérer avant toute modification

1. Faire `git status`, `git log -5 --oneline`, puis lire ce bloc et le dernier commit local. Ne pas
   écraser les changements présents et ne pousser qu’avec une nouvelle autorisation explicite.
2. Vérifier dans `Préparation 2026` quelles migrations sont réellement appliquées. La nouvelle
   `modules/votw/migrations/0004_pre_match_lineups.sql` est nécessaire au 11 avant-match. Les migrations
   football `0035` et `0036` restent à confirmer depuis l’admin au lieu de le déduire des captures.
3. Ne lancer aucun appel API-Football sans accord explicite. Une clé Pro disponible ne constitue pas
   une autorisation de consommer le quota.

#### Lot A — contrôle après déploiement (prioritaire, petit et réversible)

1. Après application de `votw/0004`, créer dans l’admin une session avant-match sur un match futur de
   la Belgique, générer les éligibles et vérifier le message de source : `convocations exactes` est le
   cas normal ; `noyau actuel` nécessite une vérification éditoriale avant ouverture.
2. Tester `/diables-rouges` puis `/onze?match=<uuid>` sur mobile et desktop : CTA conditionnel,
   quatre tactiques, onze joueurs uniques, changement de tactique, reconnexion et lien partagé.
3. Tester une Nations League actuellement alimentée seulement par l’import Belgique : matchs visibles,
   avertissement partiel visible, classement masqué. Ne retirer ce garde-fou sous aucun prétexte en
   remplissant artificiellement le tableau.
4. Amélioration suivante déjà identifiée : pour le résultat communautaire multi-tactiques, choisir une
   règle claire (tactique majoritaire puis XI de cette tactique, ou résultat séparé par tactique) avant
   d’étendre `computeResult`. Ne pas agréger silencieusement des postes incompatibles.

#### Lot B — premier remplissage Pro contrôlé (uniquement après accord API)

1. Commencer par les imports de base, peu coûteux, d’une compétition à la fois. Pour corriger la
   Nations League incomplète : lancer le pipeline de base de sa saison 2024-2025 (environ trois appels :
   matchs, équipes, informations), vérifier le préflight, puis contrôler le marqueur
   `full_competition_seasons[\"2024-2025\"]`, le nombre de participants et le classement.
2. Enchaîner seulement après validation : Pro League, Challenger Pro League, Croky Cup, puis Champions
   League/Europa League/Conference League. Les coupes européennes doivent importer tous les clubs de
   la compétition, pas seulement les clubs belges. Chaque compétition reste whitelistée séparément.
3. Remplir d’abord `2024-2025` de bout en bout pour valider les identifiants, phases et reprises ; faire
   ensuite `2025-2026`, puis préparer `2026-2027` sans l’activer publiquement avant contrôle. Ne jamais
   remplacer la saison 2024 : les trois saisons doivent cohabiter avec leur `season_id`.
4. Après chaque pipeline : comparer coût estimé/réel, vérifier erreurs et curseur de reprise, compter
   matchs/clubs, contrôler phases et doublons, puis seulement passer à la compétition suivante.

#### Lot C — enrichissements après les bases

1. Lancer les détails de match par lots bornés : événements, compositions, statistiques joueurs et
   statistiques collectives. Les jobs doivent reprendre seulement les endpoints dont le marqueur est
   absent ; conserver `Promise.allSettled` et les saisies manuelles/verrouillées.
2. Historiser les convocations belges match par match avant d’ouvrir votes et notes. Un ancien match ne
   doit jamais retomber silencieusement sur le noyau courant côté public.
3. Importer les carrières des joueurs suivis par petits lots avec estimation, plafond, progression et
   reprise. Priorité aux Diables et Belges suivis, pas à tous les joueurs de tous les championnats.
4. Contrôler les liens équipe première/U23/jeunes. Les correspondances connues peuvent être proposées,
   mais une liaison manuelle ou verrouillée ne doit jamais être écrasée par la synchronisation.

#### Lot D — direct, seulement quand les données de base sont fiables

1. Activer le live compétition par compétition. Hors match : aucune interrogation fréquente. Fenêtre
   proche du coup d’envoi : fréquence modérée ; match en direct : fréquence configurable dans l’admin.
2. Un tick doit regrouper tous les matchs simultanés couverts par l’endpoint live, pas multiplier un
   appel par match. Afficher dans l’admin coût projeté par heure, nombre de matchs suivis et quota restant.
3. Prévoir arrêt automatique après statut final, heartbeat, verrou anti-double runner et reprise après
   interruption. Tester d’abord sur une seule compétition et un créneau court.

#### À ne pas mélanger avec la préparation API

- Les finitions purement visuelles (densité de la sélection, forum, page Belges, etc.) peuvent faire
  l’objet de commits séparés, mais ne doivent ni déclencher un import ni masquer un défaut de données.
- Le prochain chantier produit naturel après le contrôle est le résultat communautaire multi-tactiques
  et une carte de partage plus visuelle pour le 11 des Diables. Aucun SQL supplémentaire n’est nécessaire
  tant que la règle éditoriale d'agrégation n'est pas décidée.

#### Correctif en cours — contexte saison des fiches club

- Les liens depuis une compétition transmettent désormais `?season=YYYY-YYYY` vers la fiche club.
- La fiche club utilise ce contexte pour sélectionner les matchs, l'effectif et les statistiques de la
  saison choisie, au lieu de retomber implicitement sur la saison dominante (souvent 2024-2025).
- Les affectations `player_team_seasons` restent la source de vérité par saison ; aucune donnée 2024-2025
  n'est supprimée ni remplacée. Les entraîneurs restent séparés et les entrées manuelles verrouillées
  restent prioritaires.
- Vérifications locales passées : `git diff --check`, lint (0 erreur, avertissements existants) et build
  de production avec variables Supabase factices. Correctif poussé dans `6b3b03c`.

#### Effectifs de la saison courante

- Cause du roster incomplet identifiée : `/players?team=...&season=...` fournit surtout les joueurs ayant
  déjà une ligne statistique dans la compétition. Un nouvel arrivant sans apparition pouvait donc manquer.
- Pour la saison courante uniquement, `football.squads` prend désormais `/players/squads` comme liste
  officielle, puis l'enrichit avec les statistiques de la saison. Les archives continuent à utiliser les
  données saisonnières afin de ne jamais leur injecter l'effectif actuel.
- Les affectations provider absentes de l'effectif actuel sont désactivées pour ce club et cette saison ;
  les lignes verrouillées restent protégées. La fiche club affiche tout l'effectif actif, y compris les
  joueurs à zéro apparition. Le préflight compte l'appel supplémentaire par club. Aucun SQL nécessaire.

#### Accueil Nations League et fiches joueurs

- L'accueil ne calcule plus un faux Top 5 en mélangeant les groupes de Nations League. Il réutilise le
  composant officiel compact avec sélecteur Ligue A/B/C/D et tourniquet entre les groupes.
- Les fiches joueurs acceptent plusieurs nationalités dans le champ existant (`Belgique, Maroc` ou
  `Belgo-marocain`) et affichent un badge/drapeau par nationalité. Une valeur binationale saisie
  manuellement est préservée par la synchronisation des effectifs.
- Les prochains matchs des joueurs utilisent une vraie carte domicile/extérieur avec les deux équipes,
  la compétition, la date et l'heure. Les notes suivent partout sur la fiche le code couleur demandé :
  vert à partir de 7,0, jaune de 6,0 à 6,9, rouge sous 6,0. Aucun SQL nécessaire.
- La note du bandeau joueur est celle de sa compétition principale de la saison (celle où il compte le
  plus d'apparitions), avec le nom de la compétition affiché. Elle utilise en priorité la moyenne des
  performances match par match de cette seule compétition ; le repli est sa note de saison pondérée.
  Pro League, coupe, Europe et sélection ne sont donc plus mélangées. L'ancien calcul pouvait afficher
  `5,3` malgré des notes de championnat récentes autour de `7,3`.

### 2026-09-29 — cohérence des effectifs et mercato saisonnier

- L'onglet `Joueurs` d'une compétition ne se limite plus aux lignes statistiques avec apparition : il
  charge les affectations actives de `player_team_seasons` pour la saison sélectionnée. La Pro League
  affiche donc le même effectif saisonnier que la fiche club, y compris les joueurs à zéro minute.
- Les drapeaux des nationalités utilisent désormais de petites images plutôt que les emoji système,
  absents sur certaines versions de Windows. Plusieurs nationalités séparées par une virgule restent
  affichées ensemble ; l'API-Football ne fournissant qu'une nationalité, la deuxième reste une donnée
  éditoriale à saisir dans le champ admin protégé (ex. `Belgique, Maroc`).
- Migration idempotente `football/0037_player_transfers` : table publique `player_transfers`, index par
  saison/club, RLS lecture publique et écriture admin. Ne jamais modifier les migrations précédentes.
- Nouveau pipeline indépendant `🔁 Mettre à jour le mercato` (`football.transfers`) : un appel par club,
  lots reprenables de trois clubs, sans modifier les pipelines de mise en place déjà en cours. Il stocke
  les mouvements de la saison, désactive l'affectation de départ non verrouillée, crée/réactive
  l'affectation d'arrivée quand le club est connu et préserve tous les joueurs/transferts verrouillés.
- La vue d'ensemble d'une compétition affiche les cinq mouvements les plus récents de la saison après
  ce pipeline. L'administration expose aussi la table dans `Clubs & effectifs > Transferts`.
- Ordre de déploiement : appliquer `0037_player_transfers.sql`, déployer le code, choisir la compétition
  et la saison dans `Jobs et historique`, simuler puis lancer uniquement `Mettre à jour le mercato`.
  Aucun appel API-Football n'a été effectué pendant le développement.

### 2026-09-29 — grille desktop des Diables Rouges

- Le grand vide visible sous le match principal venait de la grille CSS : les résultats et la sélection
  démarraient sur une nouvelle ligne pleine largeur seulement après la fin de la colonne FIFA, plus haute.
- Le contenu éditorial est désormais empilé dans la colonne principale (match, statistiques, avant-match,
  résultats, sélection), tandis que le classement FIFA, les notes et les prochains matchs restent dans une
  colonne latérale indépendante. Les modules de gauche ne sont donc plus repoussés vers le bas sur desktop.
- Les résultats et les groupes de joueurs utilisent deux colonnes dans cette largeur utile. Le rendu mobile
  conserve ses cartes compactes et sa liste de sélection par poste. Aucun SQL nécessaire.

### 2026-09-29 — binationaux et sélection représentée

- La nationalité civile et la sélection sportive sont désormais deux informations distinctes. La migration
  idempotente `football/0038_player_national_team` ajoute `players.national_team_id`, relié à une sélection
  dans `clubs`, et reprend seulement les convocations seniors déjà connues lorsque le champ est vide.
- Dans l'administration d'un joueur, `Nationalité(s)` peut donc rester `Belgique, Grèce`, tandis que
  `Sélection représentée` pointe vers `Greece`. Le verrou dédié `national_team_locked` protège ce choix
  éditorial. Les synchronisations seniors alimentent uniquement un lien non verrouillé, sans écraser la
  nationalité existante ; les catégories de jeunes ne fixent pas ce choix.
- La fiche joueur sépare visuellement les nationalités de la sélection représentée et ajoute les prochains
  matchs de cette sélection à ceux de son club.
- Sur `Belges à l'étranger`, les matchs internationaux utilisent `national_team_id`. Les cartes montrent au
  maximum trois visages, deux noms et un compteur, au lieu d'empiler tout l'effectif dans un texte jaune.
- Ordre de déploiement : appliquer `0038_player_national_team.sql`, puis déployer le code. Pour un binational
  absent des convocations déjà synchronisées, choisir sa sélection manuellement dans la fiche joueur admin.
  Aucun appel API-Football n'a été effectué.

### 2026-09-29 — correctifs mercato et détails Nations League

- `football.transfers` trie désormais les mouvements chronologiquement. Une arrivée/réactivation remet
  explicitement `left_at` à `null`, et une sortie ne modifie que l'affectation dont `joined_at` est antérieur
  ou égal au transfert. Cela évite `player_team_seasons_dates_check` lors de plusieurs passages dans le
  même club pendant une saison, sans relâcher la contrainte SQL.
- `football.lineups` utilise pour ses endpoints lourds un délai de 20 secondes et une seule tentative par
  lot, au lieu de deux tentatives coupées à 12 secondes. Le lot est plafonné à deux matchs et le pipeline
  `Compléter la saison` enchaîne automatiquement les suivants. La route de job déclare 60 secondes, limite
  compatible avec Vercel Hobby.
- Les succès partiels restent enregistrés endpoint par endpoint : une relance ne redemande que les données
  encore incomplètes. Aucun SQL supplémentaire et aucun appel API-Football pendant ce correctif.

---

## SOCLE_CANDIDATES  (documenter seulement — NE PAS remonter au socle maintenant)

Fonctionnalités Belfoot qui seraient de bons candidats à généraliser dans le socle plus tard :

1. **Textes administrables** (`lib/labels.js` + panneau Textes) — `L(key, fallback)` + surcharge
   `site_settings.data.labels`. Très générique.
2. **Ordre d'affichage administrable** (`position` + tri client fallback nom) — pattern réutilisable
   pour toute liste d'entités.
3. **image = décor / contenu = dynamique** (CompetitionHeader overlay, bannière décorative) — modèle
   d'en-tête réutilisable pour n'importe quel type de page.
4. **Blocs activables/désactivables + ordonnables + pliables** (`clubSections` + `CollapsibleSection`)
   — moteur de « page à sections configurables » utile pour fiches produit/joueur/club/article.
5. **Fonds visuels administrables par tuile** (`lib/tiles.js` + panneau Tuiles : bg/overlay/accent/
   enabled) — système de « KPI/leader cards » thématisables.
6. **Priorité des overrides manuels sur les données externes** (verrou `locked`, `logo_url`
   fill-if-empty, `ext` isolé, champs admin hors `ownedFields`) — règle d'or de tout module à sync.
7. **Navigation contextualisée** (« Voir tout » / cartes qui restent dans l'entité courante via
   onglets + ancres, pas de « première compétition » par défaut).
8. **Composants génériques** : `EntityManager` (CRUD table + spec + relation recherchable +
   regroupement), cartes **Leader/KPI** avec accent + filigrane + fond admin, `StandingsTable` avec
   zones, `MatchRow`.
9. **Contrat de provider + sync par entité + jobs scoppés** (`competitionId` explicite, service-role,
   runner sécurisé par rôle admin, coverage gating, upsert par `(source, external_id)`).
10. **Rounds/phases génériques** (parsing `round_raw`/`phase`/`round_number`) — modèle pour toute
    donnée à phases (championnat/coupe, saisons, sous-périodes).
11. **Point d'entrée de contribution public** (`/proposer` + `lib/propose.js` + `ProposePanel`) —
    hub unique qui liste automatiquement les collections `contribute:true`, avec surcouche
    administrable (textes du bandeau + libellé/ordre/visibilité par type) dans
    `site_settings.data.propose`. Capacité moteur pure, branchée sur la capacité
    contributions/modération existante.
12. **Résolution admin générique d'une collection** (registry : toute collection déclarée →
    `CollectionManager`, au lieu d'un câblage par clé) — supprime le besoin d'ajouter un cas admin
    à chaque nouveau type de contenu.
13. **Regroupement par poste** (`lib/positions.js` — `groupByPosition`, tolérant EN/abrégé, repli
    « Autres ») — utile pour tout effectif/roster ; `POS` est encore dupliqué dans la fiche club et
    `EntityManager`, à faire converger vers ce helper.

> Rappel : ne pas modifier le socle pour l'instant. Ceci est une **liste de candidats** à valider
> une fois éprouvés par l'usage sur Belfoot.
### 2026-09-29 — ChatGPT — compétitions européennes et enveloppes Pro

- Le portail `/competitions` propose désormais trois entrées distinctes : `Belgique`, `Europe` et
  `International`. Les retours depuis une compétition européenne conservent l'univers `europe` au
  lieu de renvoyer vers le mélange Europe/sélections.
- Sur la vue d'ensemble des compétitions européennes de clubs, la tuile de classement n'est plus
  limitée à un Top 5. Elle affiche le classement complet dans une zone compacte défilable, sans les
  grands espaces artificiels observés avec cinq lignes étirées.
- Le plafond serveur historique de 100 appels pour un job isolé a été supprimé. Jobs et pipelines
  acceptent maintenant une enveloppe explicite jusqu'à 5 000 appels. Les protections restent en
  place : cible obligatoire, whitelist du plan d'import, estimation préalable, comparaison au quota
  connu et confirmation administrateur. Aucun appel API-Football n'a été exécuté pendant ce travail.
- Les leaders d'une compétition utilisent toujours en priorité `player_season_stats`. Si certains
  agrégats ne sont pas encore disponibles, les statistiques par match déjà importées servent
  maintenant de repli pour les buts, passes, minutes et notes. La mise en place de saison alimente
  les effectifs et agrégats ; `Compléter la saison` enrichit progressivement le repli match par match.
- Aucun SQL ni nouvelle migration n'est nécessaire pour ce lot.

### 2026-09-29 — ChatGPT — recentrage du suivi des Belges

- `/belges-a-l-etranger` et les blocs Belges de l'accueil se basent maintenant en priorité sur le
  pays réel du club courant (`clubs.ext.country`), et non sur la dernière compétition synchronisée.
  Un Belge de Pro League engagé en Champions League ne peut donc plus être pris pour un expatrié
  simplement parce que sa dernière synchronisation provenait d'une compétition européenne.
- Les clubs belges et les sélections nationales sont exclus de cet annuaire. La nationalité belge
  du joueur reste requise, ainsi que le choix éditorial `tracked=true` : l'import d'un championnat
  complet ne publie donc pas automatiquement tous ses joueurs sur la page cœur produit.
- Le libellé de l'annuaire explicite désormais qu'il contient uniquement les joueurs évoluant hors
  de Belgique. Aucun SQL ni appel API n'est nécessaire.

### 2026-09-29 — ChatGPT — notation et prochains rendez-vous des Diables

- La colonne « Prochains rendez-vous » utilise maintenant une carte compacte propre à la sidebar,
  sans largeur minimale héritée des cartes de résultats. Les noms, logos, date et heure restent
  lisibles sans débordement ni fragments de bordure.
- Le bloc de notation montre six joueurs avant le bouton « Voir tous les joueurs », puis permet bien
  d'ouvrir toute la liste historique du match.
- La cause des listes historiques incomplètes était plus profonde : API-Football pouvait fournir une
  composition avant que certains internationaux n'existent dans `players`. `syncLineups` matérialise
  désormais une fiche minimale depuis les données de match déjà stockées, relie
  `match_player_stats`, puis crée la ligne `national_match_callups` du match concerné. Cette réparation
  ne remplace jamais une sélection historique par l'effectif actuel et ignore les lignes verrouillées.
- Après déploiement, relancer `Compositions & statistiques` sur la compétition internationale et la
  saison concernées suffit à réparer les joueurs déjà stockés, même si le match est marqué complet ;
  aucun appel API supplémentaire n'est nécessaire pour cette phase de réparation.
- Aucun SQL ni nouvelle migration n'est nécessaire.

### 2026-09-29 — ChatGPT — classement européen lisible

- La première version du classement européen complet restait enfermée dans l'ancienne colonne du
  Top 5 et laissait un grand vide sous sa zone scrollable. Sur la vue d'ensemble, le classement
  occupe maintenant toute la largeur et répartit toutes les équipes sur une, deux ou trois colonnes
  selon l'écran. Les cartes Résultats et Prochaine journée passent en dessous sur desktop.
- Les clubs dont `clubs.ext.country = Belgium` sont mis en évidence par une ligne rouge/ambre, un
  liseré et un drapeau belge. Cette distinction est strictement visuelle et n'altère pas le calcul du
  classement. Aucun SQL ni appel API n'est nécessaire.

### 2026-09-30 — ChatGPT — carrière complète et catalogue des sélections

- Le rafraîchissement ciblé depuis une fiche joueur conserve l'historique des clubs et récupère
  désormais, avec un second appel explicitement estimé, toutes les lignes statistiques de la saison :
  championnat, coupes nationales et compétitions continentales, même lorsque Belfoot ne synchronise
  pas ces compétitions comme portails complets.
- Les clubs, compétitions et saisons nécessaires à l'affichage sont créés comme références techniques.
  Les compétitions découvertes par ce biais restent `public_visible=false` : aucun calendrier, effectif
  global ou championnat étranger complet n'est aspiré. Les statistiques verrouillées restent prioritaires.
- L'éditeur de la fiche joueur ne dépend plus uniquement des sélections déjà importées. Il propose un
  catalogue de plus de 120 nations couvrant largement le top 75 FIFA et les doubles nationalités les
  plus courantes en Belgique, dont RD Congo et Congo. Une sélection absente est créée comme référence
  éditoriale minimale seulement au moment où elle est choisie.
- Le préflight du bouton annonce deux appels et son budget strict est fixé à deux. Aucun appel
  API-Football n'a été effectué et aucune migration SQL supplémentaire n'est nécessaire.

### 2026-09-30 — ChatGPT — parcours international et rafraîchissement par club

- Les sélections nationales déjà présentes dans `player_team_seasons` restent conservées pour ne pas
  supprimer de données, mais elles sont exclues du bloc public « Parcours en club ». Les futurs imports
  de carrière ne créent plus d'affectation de club pour une équipe détectée comme sélection.
- La fiche joueur possède un bloc « Parcours international » séparé. Il additionne les apparitions
  effectivement enregistrées dans `player_season_stats` pour la sélection A, les U21 et, si nécessaire,
  les autres catégories de jeunes. Le libellé précise qu'il ne s'agit que des saisons synchronisées.
- Les totaux principaux de la fiche (matchs, buts, passes et note) excluent désormais les lignes de
  sélection afin de ne pas mélanger performances en club et internationales.
- La fiche club propose aux administrateurs « Actualiser les joueurs du club ». Le navigateur traite
  l'effectif joueur par joueur, avec préflight et enveloppe stricte de deux appels par joueur, afin de ne
  pas dépasser la durée Vercel Hobby. Chaque succès marque la saison dans `players.ext.career_stats_seasons` :
  une relance ignore les joueurs déjà terminés et reprend uniquement les autres.
- Aucun nouvel SQL et aucun appel API-Football n'ont été nécessaires pour développer ce lot.

### 2026-09-30 — ChatGPT — centre éditorial des Belges à l’étranger

- La page `/belges-a-l-etranger` ne commence plus par un long annuaire. Elle présente désormais le
  **Belge du moment** en priorité, puis quatre joueurs en forme, les prochains rendez-vous, les
  championnats représentés et enfin le répertoire filtrable.
- Le Belge du moment respecte le choix administrateur `featured_player_id` déjà existant. Sans choix,
  le premier joueur du classement de forme prend ce rôle automatiquement. La présentation reste
  compacte sur mobile : quatre cartes, deux colonnes, et des indicateurs de notes récents.
- Les notes des cartes suivent la convention Belfoot : vert à partir de 7, jaune de 6 à 6,99, rouge
  sous 6. Les drapeaux de pays passent par le catalogue commun de nationalités, plus complet que
  l'ancienne liste locale de quelques pays.
- Les statistiques et le classement de forme de cette page écartent les lignes d’équipe nationale :
  cette vue reste un suivi en club à l’étranger, tandis que le parcours international est traité sur
  la fiche joueur.
- Aucun SQL, aucune migration et aucun appel API-Football ne sont nécessaires. La page exploite
  uniquement les données déjà présentes dans Supabase.

### 2026-09-30 — ChatGPT — correctifs navigation et sélections

- Le lien « Voir tous les matchs » du bloc d’accueil *Les Belges à suivre aujourd’hui* ouvre
  désormais `/direct` au lieu du calendrier nécessitant une compétition. Le même raccourci de la
  page Belges à l'étranger est aligné.
- `/diables-rouges` ne dépend plus uniquement de `national_followed=true` pour afficher les équipes
  belges. Toute sélection belge déjà importée est proposée ; l'équipe A repasse avant les Red Flames
  grâce à l'ordre explicite des catégories. Ceci répare le cas où seule l'équipe féminine apparaissait
  après un changement de drapeau dans les données.
- Le Plan d'import et la liste de synchronisation masquent les doublons partageant le même couple
  `provider + external_id` (ex. « Europa League » / « UEFA Europa League », « Pro League » /
  « Jupiler Pro League »). Les données, saisons et historiques ne sont ni fusionnés ni supprimés :
  c'est une protection d'interface en attendant une consolidation contrôlée ultérieure.
- Aucun SQL, aucune migration et aucun appel API-Football ne sont nécessaires pour ces correctifs.

### 2026-09-30 — ChatGPT — audit des sélections et compactage des fiches

- Le Plan d'import ajoute un audit **en lecture seule** des doublons provider. Il affiche les
  compétitions ayant le même couple `provider + external_id`, leurs saisons, leur nombre de matchs
  et les sélections belges réellement stockées (`A`, `U21`, Red Flames, etc.). Il ne fusionne, ne
  supprime et ne relance absolument rien : la consolidation viendra seulement après validation du
  rapport par l'administrateur.
- La détection de la Belgique sur `/diables-rouges` est tolérante aux variantes réellement renvoyées
  par les imports (`Belgium U21`, pays dans `ext`, « Diables », Red Flames). Si A ou U21 ne ressortent
  toujours pas, l'audit montrera qu'elles ne sont plus présentes dans `clubs` et il faudra les relier
  par la synchronisation ciblée, plutôt que de créer de fausses équipes côté interface.
- Le visuel « Belge du moment » garde maintenant un monogramme sous la photo : une URL de portrait
  expirée ne peut plus laisser une image cassée ou déstructurer la carte.
- La fiche joueur est moins étirée sur desktop : colonnes plus resserrées et total des sélections A /
  U21 placé directement sous l'identité. Le bloc latéral redondant est retiré ; les parcours club et
  international restent séparés.
- Aucun SQL, aucune migration et aucun appel API-Football ne sont nécessaires pour ce lot.

### 2026-09-30 — ChatGPT — liens de recherche football

- Les résultats de recherche football n’ouvraient pas leur fiche et redirigeaient tous vers le
  calendrier `/matchs`. Un joueur (ex. Mokio) ouvre désormais `/players/:id` et un club ouvre
  `/clubs/:id`.
- Aucun SQL, aucune migration et aucun appel API-Football ne sont nécessaires.

### 2026-09-30 — ChatGPT — effectif de la saison active en fiche club

- Le contexte par défaut d’une fiche club privilégie maintenant la saison ayant le match le plus
  récent, puis le volume de matchs. Auparavant, une archive 2024/25 complète était choisie avant
  une 2026/27 en cours : elle affichait un ancien effectif et faisait paraître les transferts
  inactifs. Une saison reste sélectionnable explicitement via `?season=2024` si nécessaire.
- Le job de mercato reste utile pour inscrire les mouvements dans l’historique et corriger les
  appartenances ; cette correction n’envoie aucun appel API et ne modifie aucune donnée.

### 2026-09-30 — ChatGPT — contrôle Nations League réaliste

- Le contrôle de préparation utilisait le repli générique international `20 clubs / 380 matchs`
  pour l’UEFA Nations League. Avec les 156 matchs réellement fournis pour 2026/27, la saison restait
  artificiellement bloquée même après les synchronisations. Le format reconnu utilise maintenant
  `54 clubs / 156 matchs` et remplace aussi automatiquement l’ancien couple générique déjà stocké.
- Les compteurs restants restent distincts : les 8 matchs signalés nécessitent encore leurs détails
  (événements, compositions, performances et statistiques collectives). Le pipeline **Compléter la
  saison** doit être utilisé plutôt que les boutons individuels : il poursuit les lots sans rejouer les
  matchs déjà marqués comme traités.
- Aucun SQL, aucune migration et aucun appel API-Football ne sont nécessaires pour ce correctif.

### 2026-09-30 — ChatGPT — mercato compatible Vercel Hobby

- Diagnostic confirmé par l’historique : `football.transfers` expirait avec
  `FUNCTION_INVOCATION_TIMEOUT`. Il essayait plusieurs clubs successivement dans une invocation,
  alors qu’un appel `/transfers` peut être lent.
- Le pipeline **« Mettre à jour le mercato »** traite désormais exactement un club par lot, stocke le
  checkpoint puis déclenche la suite automatiquement. Les mouvements déjà enregistrés restent
  idempotents. Le bouton de job brut est retiré de l’administration pour empêcher de relancer le
  chemin qui expire.
- Aucun SQL ni migration ne sont nécessaires. Les prochains lots consommeront un appel API par club ;
  aucun appel n’a été lancé pendant ce correctif.

### 2026-09-30 — ChatGPT — réparation du chaînage sélections et plan

- Diagnostic de production : la page Diables affichait une fiche « Diables Rouges » sans matchs,
  sélection ni notes. Aucun historique n'a été supprimé. Le mécanisme pouvait choisir une nouvelle
  fiche provider vide à la place d'une ancienne fiche Belgique encore reliée aux matchs et convocations.
  La page considère désormais les anciennes fiches portant Belgique/Diables/Flames et choisit, pour
  chaque catégorie A/U21/F, celle qui possède réellement le plus de matchs ou convocations. Elle ne
  crée ni ne modifie aucune donnée.
- Le contrôle du Plan d'import pouvait échouer sur `expected_clubs` lorsqu'une saison appartenait à
  une ligne doublon masquée de l'interface. Cette absence de configuration est maintenant tolérée :
  le contrôle utilise l'estimation de secours et reste accessible, pour permettre l'audit en lecture
  seule avant toute consolidation.
- Les statistiques par compétition sont remontées juste sous l'en-tête d'une fiche joueur. Sur mobile,
  elles passent en cartes compactes (matchs, titularisations, minutes, buts, passes, note) sans tableau
  horizontal à faire défiler ; le tableau détaillé reste réservé au desktop.
- Aucun SQL, aucune migration et aucun appel API-Football ne sont nécessaires pour ce correctif.

### 2026-09-30 — ChatGPT — lecture rapide des joueurs et coupes d’Europe

- La fiche joueur affiche désormais la saison en cours immédiatement avant les statistiques : minutes,
  moyenne de minutes et date d’actualisation ne sont plus enfouies après l’historique.
- Le parcours club est condensé par club (plage de saisons et nombre de saisons), avec les quatre
  dernières étapes visibles et un bouton pour déplier le reste. Cela évite de répéter Club Brugge
  plusieurs fois en hauteur tout en conservant les données d’origine accessibles.
- Dans les coupes européennes, le résumé « Course au Top 8 » garde huit lignes au lieu d’un classement
  massif, mais ajoute un repère dédié aux clubs belges engagés : rang, points et couleur de zone
  (Top 8, barrage 9–24, hors course). Le classement complet reste dans son onglet.
- Pour le problème de compétitions en double : après déploiement, lancer uniquement l’**Audit des
  doublons provider** du Plan d’import. Il est en lecture seule ; aucun import, appel API ou fusion
  ne doit être lancé avant lecture de son rapport.
- Aucun SQL, aucune migration et aucun appel API-Football ne sont nécessaires pour ce lot.
