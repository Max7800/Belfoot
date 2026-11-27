# Actualisation des périodes de mercato

## État de la première version

L'affichage couvre les compétitions API-Football 144 et 145, football professionnel masculin, saison 2026-2027, avec des dates vérifiées le 22 novembre 2026. Il n'existe pas encore de synchronisation automatique. Les périodes inconnues ne doivent jamais être déduites d'une autre saison ou d'un autre championnat.

## Source cible et obstacle

La FIFA publie un calendrier de périodes alimenté par ses associations membres : https://inside.fifa.com/transfer-system/player-transfers. Elle annonce une actualisation quotidienne : https://inside.fifa.com/news/fifa-launches-interactive-tool-to-keep-fans-on-ball-over-global-transfer-windows. Les catégories et les saisons doivent rester distinctes. La page mentionne un export CSV, mais son URL, son format, les conditions d'utilisation et son comportement en cas de mise à jour n'ont pas encore été vérifiés. Le lien d'archive trouvé sur l'ancien calendrier renvoie 404. Ne pas créer de cron branché sur un format ou une URL supposés.

## Contrat à réaliser après vérification de la source

- Associer explicitement chaque compétition à une fédération et à une catégorie (professionnel masculin, professionnel féminin ou amateur) ; une fédération peut correspondre à plusieurs compétitions. Une compétition européenne, une sélection, une catégorie ou une association non associée ne doit recevoir aucune date par défaut.
- Enregistrer les saisons et les périodes réellement publiées, sans limiter à deux périodes ni supposer une saison juillet-juin. Conserver les dates locales, le fuseau applicable, la provenance, la date de publication si disponible et l'horodatage de la dernière lecture réussie. Distinguer la date de vérification de la date de modification à la source.
- Valider le type, l'association, la catégorie, les dates calendaires, la cohérence début-fin, les identifiants et l'absence de doublons ou d'ambiguïtés avant écriture. Une réponse vide, partielle, obsolète ou de format inattendu doit signaler une erreur et préserver le dernier état valide ; ne pas interpréter une omission comme une suppression.
- Rapprocher les périodes observées avec l'historique existant ; conserver l'historique et n'appliquer une modification ou suppression qu'après avoir établi le caractère complet de la source et la règle correspondante. Éviter toute écriture si rien n'a changé et rendre les reprises idempotentes.
- Utiliser un stockage dédié avec lecture publique limitée aux données publiées et écriture réservée au service, plutôt que d'écraser le JSON partagé des réglages. Prévoir une migration et ses politiques RLS, les index et des mises à jour atomiques. Ne pas attribuer un fuseau par défaut à une association qui n'a pas été vérifiée.
- Exécuter à cadence bornée avec une route cron authentifiée et un journal d'exécution : source, nombre de périodes ajoutées ou modifiées, dernier succès, erreur et âge des données. Une panne doit déclencher un état visible pour l'administration ; l'interface publique doit afficher la dernière date de vérification ou l'indisponibilité, sans présenter une donnée ancienne comme fraîche.
- Afficher une période selon l'heure locale vérifiée, avec ses deux dates incluses. Garder la possibilité d'afficher les mouvements hors période ou de date incertaine ; ces cas ne prouvent pas une irrégularité de transfert.

## Tests avant activation

Tester un export réel et ses mises à jour, puis les cas : catégories et associations différentes, saisons chevauchant deux années ou sur une année civile, fenêtres multiples, fuseaux et heure d'été, dates invalides, réponse vide ou tronquée, doublons, changement de format, panne réseau, modification à la source, reprise et passages simultanés. Vérifier les politiques RLS, les accès anonymes, le journal d'erreur et l'affichage mobile et ordinateur. D'abord exécuter en lecture seule sur des données isolées, comparer aux dates FIFA, puis activer l'écriture et la planification seulement après validation et autorisation de mise en production.

Cette évolution concerne les périodes d'enregistrement ; elle ne fournit pas les montants des transferts et ne nécessite pas d'appel à API-Football.
