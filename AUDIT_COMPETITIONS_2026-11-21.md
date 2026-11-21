# Audit des compétitions — 21 novembre 2026

Périmètre : lecture du code et tests locaux. Aucun accès aux données de production ni appel fournisseur n'a été effectué pour cet audit ; la couverture effective et l'état des crons restent à confirmer.

## Import et publication

- `football.sync` importe le calendrier et les participants ; les détails et effectifs sont des traitements séparés. Le plan et la saison doivent être autorisés.
- Les saisons `ready`, `active` ou `public_active` sont visibles ; les données d'une saison en brouillon ne doivent pas être présentées comme des données publiées. Pour une compétition à groupes puis élimination, le type hybride permet de distinguer les phases.
- Les contrôles de publication dépendent du niveau d'import. Un contrôle « résultats » réussi ne signifie pas que les effectifs ou statistiques détaillées sont complets.

## Actualisation et quota

- Le cron sélectionne les compétitions visibles, avec fournisseur et saison publique autorisée. Les résultats, statistiques de saison et détails de match suivent des files et budgets distincts. Le suivi des statistiques internationales exige une couverture joueurs déclarée par le fournisseur. Les détails nécessitent le niveau complet.
- Correction de cette branche : le curseur des effectifs/statistiques est associé à la saison, et la date retenue à la fin d'un cycle long est celle du début du cycle. Un nouveau match survenu entre deux lots reste candidat à un passage ultérieur. Les checkpoints historiques sans saison sont redémarrés à zéro lorsqu'un match éligible nécessite une mise à jour.
- La vue d'ensemble de l'administration utilise maintenant la même règle de couverture que le cron pour les statistiques internationales et ignore les checkpoints d'une autre saison. Elle ne prouve ni l'exécution effective du cron ni l'exhaustivité des données fournisseur.
- Limite à traiter : la détection d'un nouveau match se base sur l'heure de coup d'envoi et le statut terminé ; si le statut devient terminé après un passage lancé entre le coup d'envoi et la fin, ce changement seul peut ne pas déclencher les statistiques de saison. Il faut un marqueur fiable de fin ou de modification, sans confondre de simples rafraîchissements du calendrier avec une nouvelle fin de match.
- Une réponse fournisseur vide mais réussie peut enregistrer un marqueur de synchronisation des détails : elle ne démontre pas que la donnée existe. Avant d'ajouter des répétitions, distinguer couverture non disponible, réponse vide provisoire et erreur, avec une cadence plafonnée.

## Archivage et suivi

- Les saisons publiées restent consultables et les stats sont conservées dans leurs tables. Ne pas supposer que la fin d'un tournoi coupe tous les appels : le rafraîchissement des résultats a encore une cadence de repos pour les compétitions visibles. Aucun arrêt automatique ni archivage final n'a été ajouté dans ce lot.
- Vérifier en production : visibilité et saison publique U17, plan `complete`, couverture effective des événements/compositions/statistiques, derniers jobs et progression des lots. Les classements peuvent rester incomplets si le fournisseur ne publie pas les données ou si les joueurs ne sont pas reliés.
- `diagnostics/coupe_monde_u17_stats.sql` fournit un relevé en lecture seule : nombre de matchs, événements, performances de match et statistiques de saison, avec répartition par équipe et liens joueurs. Les événements et les statistiques de joueurs sont des sources distinctes ; une réponse vide marquée synchronisée ne signifie pas que des statistiques ont été reçues. Les événements ne permettent pas, à eux seuls, de reconstituer fiablement les passeurs ni tous les joueurs sans contrôle d'identité et de couverture.
- Priorités suivantes : diagnostic administratif par compétition (dernier passage réussi, erreurs, couverture, retard et données vides), politique de rattrapage bornée, puis archivage après confirmation des derniers résultats et statistiques.
