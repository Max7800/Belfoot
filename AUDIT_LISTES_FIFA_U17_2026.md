# Belgique — liste officielle du Mondial U17 2026

## Constat vérifié le 21 novembre 2026
La Belgique apparaît sous le libellé U18 sur la feuille RBFA Belgique–Vietnam du 20 novembre 2026, qui contient 21 joueurs : https://static.rbfa.be/project/publiek/rencinter/fr/wed_15270.htm. Ces 21 joueurs correspondent à la liste FIFA du Mondial U17, version du 21 novembre 2026 11:55 UTC : https://fdp.fifa.org/assetspublic/ce303/pdf/SquadLists-English.pdf. L'ancienne liste des 23 joueurs de Belfoot vient des convocations API-Football ; elle ne correspond pas à cette liste FIFA.

## Implémentation
La synchronisation national-refresh lit le PDF FIFA au plus une fois par jour jusqu'au 27 décembre inclus (14 jours après la finale du 13 décembre), puis conserve le dernier instantané sans appel. Le parseur contrôle le titre de compétition, la page Belgique, les colonnes, la version, les 21 numéros, dates, identités et positions ; il rejette les documents tronqués et les versions plus anciennes. Une erreur conserve le dernier instantané correct. Le PDF est limité à 3 Mo et 70 pages. Aucun appel API-Football ni migration.

Une seule copie datée alimente la page Diables et la page de la compétition, pour la Belgique, la Coupe du monde U17 2026-2027 et les identifiants exacts. Après le 27 décembre, la liste reste archivée sur la compétition et ne remplace plus l'effectif courant de Diables. Les liens de joueurs sont ajoutés uniquement si nom et date de naissance correspondent de manière unique ; sinon le nom officiel reste visible sans lien. La source et la version sont affichées.

## Limites et suite
Cette intégration concerne le PDF de ce tournoi et l'équipe belge, pas encore les 47 autres équipes ou les annonces futures de toutes les sélections. Elle ne constitue pas une détection générale des annonces RBFA et ne garantit pas que l'effectif API utilisé après le tournoi représente la dernière convocation. Une feuille de match n'est pas en elle-même une liste officielle complète : l'affichage officiel vient du PDF FIFA. Le document FIFA et sa structure peuvent changer : l'échec doit rester visible dans l'état du cron, et ne jamais remplacer une liste valide. Après déploiement, contrôler le premier passage, les 21 joueurs sur les deux pages, les liens et la conservation de l'archive.

Le cron national-refresh dépend d'une sélection suivie et du déclencheur existant. Au 21 novembre, la synchronisation du classement FIFA issue de #140 était déployée mais son premier snapshot n'était pas encore présent ; vérifier le prochain passage, ne pas le déclarer validé avant résultat. Référence : issue #138.
