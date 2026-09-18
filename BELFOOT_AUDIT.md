# BELFOOT — Audit complet de passation

**Date :** 18 septembre 2026  
**Révision auditée :** `b503c15` (`main`)  
**But :** donner à Claude ou à un développeur un état fiable du projet avant toute nouvelle feature.

> Ce document est un audit statique du dépôt local : code, migrations, dépendances, build et
> historique Git disponible. Il ne remplace pas une vérification du tableau de bord Supabase,
> des variables Vercel, des redirect URLs Auth, des politiques Storage réellement déployées ni un
> test d'intrusion sur la production. Ces points sont explicitement listés comme « à vérifier ».

---

## 1. Verdict exécutif

Belfoot a désormais une base produit cohérente : compétitions génériques, championnat/coupe,
classements par phase, fiches clubs/joueurs, import ciblé, Belges à l'étranger, admin configurable
et responsive public nettement amélioré. Le build de production passe.

En revanche, **ne pas ajouter C1/C3/C4, d'autres ligues étrangères ou des fonctions communautaires
avant le lot de durcissement P0**. Trois risques dominent :

1. **Escalade de privilèges Supabase** : correctif codé dans la migration core `0002`, à déployer.
2. **HTML éditorial non assaini** : rendu et approbation assainis dans le lot suivant l'audit.
3. **Dépendances vulnérables** : `npm audit` remonte 27 vulnérabilités, dont Next.js classé critique.

La dette suivante est surtout opérationnelle : migrations manuelles non suivies, imports qui
peuvent annoncer un succès malgré des écritures en erreur, absence de `season_id` sur les matchs
provider, consommation API non verrouillée et requêtes publiques qui ne passeront pas à l'échelle.

### État synthétique

| Domaine | État | Décision |
|---|---:|---|
| Build Next.js | Bon | Passe sur Next `14.2.35` |
| Secrets dans Git | Bon | Aucun PAT/secret serveur trouvé dans le dépôt ou l'historique inspecté |
| Auth des jobs | Bon sous réserve | JWT admin / secret cron correctement contrôlés, mais compromis par la faille de rôle |
| RLS métier football | Bon | Lecture publique, écriture admin ; cohérent pour les données sportives |
| RLS profils | Critique | À corriger avant toute ouverture des inscriptions |
| Contenu riche | Critique/haut | Sanitize obligatoire avant affichage et à l'approbation |
| Dépendances | Critique | Upgrade Next/Tiptap à préparer dans une branche dédiée |
| Migrations | Fragile | Passage manuel, dérive réelle déjà constatée (`players.country`) |
| Sync API | Fonctionnelle mais fragile | Idempotence partielle, erreurs avalées, pas de verrou de job |
| Modèle saisons | Incomplet | Les imports n'attachent pas les matchs à `season_id` |
| Performance front | Correcte en V1 | Requêtes trop larges et plafond Supabase futur |
| Tests/CI/observabilité | Insuffisant | Aucun test, aucune CI, aucun error boundary/monitoring |
| SEO | Incomplet | Football rendu client, domaine placeholder, pas sitemap/robots |

---

## 2. Contrôles effectués

- inventaire complet des fichiers applicatifs, migrations et routes API ;
- inspection de l'auth, du rôle admin, des RLS et des fonctions `security definer` ;
- inspection des uploads, contributions, contenu riche et liens externes ;
- recherche de secrets dans le worktree et l'historique Git disponible ;
- inspection des jobs, providers, quotas, erreurs et règles de verrouillage manuel ;
- inspection des requêtes Supabase publiques, limites, pagination et relations saison/phase ;
- inspection du SEO, de l'accessibilité structurelle, des états d'erreur et de la configuration ;
- `npm audit --package-lock-only` et `npm outdated` ;
- build Next.js avec variables Supabase factices ;
- vérification `git diff --check`.

**Non vérifiable depuis le dépôt :** politiques du bucket Storage `media`, taille/MIME du bucket,
configuration Auth Supabase, redirect URLs OAuth, MFA admin, variables Vercel, protection de branche
GitHub, journaux Vercel/Supabase, sauvegardes/PITR et état exact de toutes les migrations en prod.

---

## 3. Sécurité — constats prioritaires

### SEC-01 — CRITIQUE — Un membre peut tenter de se promouvoir admin — CORRIGÉ, SQL À DÉPLOYER

**Correctif du 18 septembre 2026 :** `0002_profile_role_hardening.sql` supprime l'INSERT client,
limite l'UPDATE authentifié à `username` et ajoute la RPC admin `set_profile_role`. La RPC valide le
rôle, journalise l'action et interdit de rétrograder le dernier admin. `ProfilesPanel` l'utilise et
remonte maintenant les erreurs. Le risque reste présent sur l'instance tant que ce SQL n'y est pas
appliqué.

**Preuve :** `supabase/schema.sql` et `supabase/migrations/0001_core.sql` contiennent :

```sql
create policy "profiles_self_write"
on profiles for update using (auth.uid() = id);

create policy "profiles_insert"
on profiles for insert with check (auth.uid() = id);
```

La première règle autorise le propriétaire de la ligne à mettre à jour toute la ligne, donc aussi
`role`. La seconde autorise une insertion personnelle avec un rôle fourni par le client si le
trigger de création n'a pas créé la ligne. Comme `is_admin()` lit ce champ, l'impact potentiel est
la prise de contrôle de toutes les tables admin et de `/api/admin/run-job`.

**Correction attendue :**

- retirer l'INSERT direct des profils aux utilisateurs ; le trigger crée déjà le profil ;
- limiter les membres à la colonne `username` ;
- déplacer le changement de rôle vers une RPC `security definer` réservée à `is_admin()` ou vers
  une route serveur admin ;
- adapter `ProfilesPanel` pour utiliser cette RPC/route ;
- tester avec trois sessions : anonyme, membre, admin.

Ne pas se contenter du guard React de `/admin` : il masque l'UI mais la vraie barrière reste RLS.

### SEC-02 — CRITIQUE — Version Next.js signalée vulnérable

`npm audit` sur le lockfile trouve **27 vulnérabilités** : `1 critical`, `1 high`, `25 moderate`.
Next `14.2.35` concentre plusieurs avis DoS/SSRF/cache et deux avis classés RCE dans les versions
concernées. Certains scénarios sont spécifiques à Windows, aux Server Actions ou à l'optimiseur
d'images et ne sont pas tous directement exploitables sur Vercel/Belfoot ; cela ne justifie pas de
rester sur une branche non corrigée.

**Correction attendue :** branche dédiée d'upgrade vers une version Next supportée et corrigée
(au moment de l'audit, npm propose `16.3.5`), avec migration React si nécessaire, build puis tests
des routes publiques, Auth et API. Ne pas lancer `npm audit fix --force` directement sur `main`.

### SEC-03 — HAUT — XSS stockée possible via le contenu riche — CORRIGÉ DANS LE CODE

**Correctif du 18 septembre 2026 :** le HTML est nettoyé au rendu avec une allowlist serveur. La
modération passe par `/api/admin/contributions/review`, qui revalide le JWT et le rôle admin, relit
la contribution en base, valide collection/type/cible/champs/tailles/URLs, assainit les champs
richtext et journalise la décision. L'admin voit désormais tous les champs avant acceptation ; une
nouvelle contribution devient un brouillon et n'est plus publiée automatiquement. Un payload
hostile (`script`, `onclick`, `javascript:`) a été vérifié localement, et le build passe.

`components/RichContent.js` utilise `dangerouslySetInnerHTML` sans assainissement. Le commentaire
« contenu admin, de confiance » est faux dans le flux actuel : un membre peut insérer un `payload`
JSON arbitraire dans `contributions`; l'admin ne voit que le titre et l'accroche, puis
`reviewContribution()` copie le corps dans `entries` et le publie. Une contribution malveillante
approuvée peut donc injecter du HTML dangereux.

Risques associés :

- aucune prévisualisation complète/diff avant approbation ;
- `collection`, `kind`, `target_id` et le contenu du payload ne sont pas validés côté serveur ;
- un lien Tiptap ou un import JSON peut contourner l'éditeur normal.

**Correction attendue :**

- assainir côté serveur avec une allowlist HTML stricte au moment de sauvegarder/approuver ;
- assainir également au rendu par défense en profondeur ;
- refuser `script`, événements `on*`, `style`, `iframe`, URL `javascript:`/`data:` non autorisées ;
- valider les clés par rapport à `config/collections.js` ;
- afficher le corps, les images et un diff complet avant le bouton Accepter ;
- ne pas publier automatiquement une contribution sans écran de relecture.

`npm audit` signale en plus une vulnérabilité XSS/prototype pollution dans Tiptap 2.x ; la version
corrigée proposée est Tiptap 3.x, donc migration majeure à tester séparément.

### SEC-04 — HAUT À CONFIRMER — Storage n'est pas versionné

Le client charge directement vers le bucket public `media`, mais aucune création de bucket ni
policy `storage.objects` n'est présente dans le dépôt. La sécurité réelle dépend donc d'une
configuration manuelle invisible pour Claude.

**À vérifier immédiatement dans Supabase :**

- lecture publique seulement si réellement nécessaire ;
- upload/suppression admin uniquement, ou chemin `contributions/<uid>/...` pour les membres ;
- limite de taille et allowlist MIME (`image/jpeg`, `image/png`, `image/webp`) ;
- noms de fichiers isolés par utilisateur ;
- aucun upload arbitraire exécutable via `uploadFile` pour un membre.

Le code actuel nomme toutes les images à la racine du bucket et ne porte pas l'UID. Une politique
propre par utilisateur exigera donc une modification de `lib/media.js`.

### SEC-05 — MOYEN — Pas de CSP ni d'en-têtes de durcissement

`next.config.js` ne définit ni Content-Security-Policy, ni `X-Content-Type-Options`, ni
`Referrer-Policy`, ni `Permissions-Policy`, ni règle de frame. Une CSP serait particulièrement utile
en défense complémentaire du contenu riche.

Déployer d'abord une CSP en `Report-Only`, inventorier Supabase/API/images, puis l'activer. Ajouter
au minimum `nosniff`, une politique referrer et `frame-ancestors`/`X-Frame-Options` cohérents.

### SEC-06 — MOYEN — Entrées communautaires sans contraintes fortes

- `votes.value` accepte n'importe quel entier, pas seulement `-1/+1` ;
- commentaires, signalements et contributions n'ont ni limite de taille ni rate limit applicatif ;
- un auteur peut modifier son commentaire et son statut après modération selon la politique actuelle ;
- les tables forum désactivées permettraient à un auteur d'éditer aussi `pinned`/`locked` si le
  module était activé sans durcissement ;
- VOTW ne vérifie pas en base que la session est ouverte ni que le joueur est candidat.

Ces modules sont en grande partie désactivés, mais ils doivent être durcis **avant activation**.

### SEC-07 — MOYEN — Les erreurs provider peuvent divulguer des détails

Les routes jobs renvoient directement `e.message` et le stockent dans `job_runs.detail`.
TheSportsDB place sa clé dans l'URL et son erreur contient l'URL complète : une clé payante pourrait
donc apparaître dans l'admin/historique. Masquer les secrets, journaliser un identifiant d'erreur et
retourner un message utilisateur neutre.

### SEC-08 — PROCESS — Les PAT GitHub sont transmis dans la conversation

Le remote Git local ne contient pas de token et la recherche Git n'a trouvé aucun motif `ghp_`
committé. En revanche, le workflow manuel multiplie les PAT affichés dans la conversation.

**À remplacer :** connexion GitHub intégrée/`gh auth`, clé SSH, GitHub App ou token fine-grained à
durée courte et dépôt unique. Révoquer tous les PAT déjà utilisés et activer la protection de
branche avec CI avant push sur `main`.

### Points sécurité positifs

- `SUPABASE_SERVICE_ROLE_KEY`, `JOBS_SECRET` et clés provider ne portent pas `NEXT_PUBLIC_` ;
- `supabaseAdmin` n'est importé que dans les routes serveur inspectées ;
- `/api/admin/run-job` valide le JWT auprès de Supabase puis relit le rôle ;
- `/api/jobs/[key]` exige un secret en header et refuse si la variable est absente ;
- les tables football ont RLS lecture publique / écriture `is_admin()` ;
- `.env*.local` est ignoré et aucun fichier `.env` réel n'est présent dans le dépôt ;
- l'URL Git remote ne contient aucun credential.

---

## 4. Données, migrations et synchronisations

### DATA-01 — HAUT — Les migrations manuelles ont déjà dérivé

La table `schema_migrations` existe mais aucun runner ne l'utilise. Les fichiers sont copiés à la
main dans Supabase, plusieurs migrations/policies ne sont pas rejouables sans erreur et il n'y a ni
transaction globale ni preuve automatique de l'état de production. L'erreur `players.country`
était la manifestation concrète de cette dérive.

**À faire :** adopter Supabase CLI ou un runner interne, rendre chaque migration idempotente quand
c'est raisonnable, enregistrer `(module, version, checksum)`, ajouter une commande `migration:status`
et bloquer les jobs si une migration requise manque.

### DATA-02 — HAUT — Les matchs provider n'ont pas de `season_id`

`syncCompetition()` et `syncTeamTest()` enregistrent `competition_id` mais jamais `season_id`.
Conséquences :

- les sélecteurs de saison retombent silencieusement sur tous les matchs ;
- plusieurs saisons finiront mélangées ;
- la fiche club ne calcule classement/statistiques que si un contexte `competition_id:season_id`
  existe, donc les données provider peuvent afficher « aucun classement » ;
- les zones configurées pour une saison peuvent être appliquées à un ensemble non scoppé.

**À faire avant la saison suivante :** résoudre/créer la saison au début du job et poser son UUID
sur chaque match upserté. Ajouter une migration de backfill fondée sur compétition + année provider.

### DATA-03 — HAUT — `syncSquads` confond effectif et suivi Belfoot

Le job met `tracked: true` sur **tous** les joueurs de chaque effectif. Sur une ligue étrangère,
`track-belgians` peut alors demander les statistiques de tous les joueurs, pas seulement des Belges,
et le Dashboard compte des non-Belges comme « suivis ». L'annuaire masque le problème grâce à son
filtre de nationalité, mais le quota et la sémantique sont faux.

Séparer :

- `active`/présent dans l'effectif ;
- `tracked`/sélection éditoriale Belfoot ;
- import complet domestique nécessaire aux pages compétition ;
- découverte étrangère qui laisse `tracked=false`, sauf import ciblé explicitement belge.

### DATA-04 — HAUT — Succès de job potentiellement mensonger

`upsertExternal()` n'inspecte pas les erreurs de `update/insert`. Plusieurs jobs ignorent aussi les
erreurs de lecture/écriture, et `syncCompetition()` avale entièrement les erreurs d'enrichissement
clubs/ligue. Un job peut donc finir `ok` avec une base partielle.

Toutes les opérations critiques doivent lever sur `error`, avec un rapport structuré : requêtes API,
lignes insérées/mises à jour/ignorées, avertissements et erreurs. Les enrichissements facultatifs
peuvent rester non bloquants, mais doivent apparaître comme `warning`.

### DATA-05 — MOYEN/HAUT — Protection `locked` incohérente

Le correctif récent permet à `syncTeamTest` de mettre à jour `player_season_stats` même si la fiche
joueur est verrouillée. `syncSquads` et `discoverPlayers` font encore `continue`, donc peuvent sauter
les stats/découvertes. Formaliser une règle unique : le verrou protège les champs de la fiche, jamais
les tables statistiques séparées.

### DATA-06 — HAUT — Risque de quota par concurrence et répétitions

- aucun verrou n'empêche deux jobs identiques de tourner en parallèle ;
- aucune estimation de coût n'est confirmée avant un job lourd ;
- `syncSquads` peut faire jusqu'à 3 pages par club ;
- événements : jusqu'à 40 requêtes/run ; lineups : jusqu'à 2 requêtes/match ;
- un match sans événement n'est jamais marqué « traité » et peut être redemandé ;
- une composition sans minutes finales peut être redemandée ;
- un timeout Vercel peut laisser `job_runs.status='running'` définitivement.

Ajouter verrou/advisory lock, budget de requêtes, compteur journalier, `processed_at` même pour une
réponse vide, reprise après timeout et bouton de confirmation affichant le coût maximal.

### DATA-07 — MOYEN — Pas de timeout/retry provider

Les `fetch()` n'ont pas de `AbortController`, de timeout, de retry/backoff sur 429/5xx ni de contrôle
HTTP complet côté API-Football avant `r.json()`. Ajouter un wrapper provider commun avec timeout,
retry borné, lecture des headers quota et redaction des erreurs.

### DATA-08 — MOYEN — Mise à jour destructive des événements

`syncEvents` supprime les événements existants avant l'insertion des nouveaux. Si l'insert échoue,
le match perd ses données. Préférer une RPC transactionnelle ou insérer/upserter dans une transaction
côté base.

---

## 5. Front, performances, qualité et produit

### PERF-01 — HAUT avant extension des données — Requêtes trop larges

Exemples actuels :

- accueil : jusqu'à 500 matchs + toutes les compétitions/saisons/stats joueurs ;
- Belges : 700 matchs + 500 performances ;
- compétition : tous les matchs, joueurs, stats et `match_player_stats` ;
- admin générique : listes sans pagination ;
- nombreux `.select("*")`, incluant les payloads `ext` lourds.

Le plafond Supabase de 1 000 lignes tronquera silencieusement `match_player_stats` d'un championnat
complet. La page compétition calculera alors des leaders/clean sheets incomplets. Avec Europe +
plusieurs ligues, l'accueil et l'annuaire deviendront lourds.

**À faire :** colonnes explicites, requêtes par fenêtre de date, pagination, vues/RPC agrégées pour
leaders/classements/récaps, indexes vérifiés par `EXPLAIN`, et cache serveur.

### ARCH-01 — HAUT — Aucun test ni CI

Il n'existe aucun test unitaire, intégration ou end-to-end, aucune GitHub Action et aucune protection
visible avant push direct sur `main`. De plus, `npm run lint` n'est pas opérationnel en CI : il ouvre
encore l'assistant interactif de configuration ESLint et sort en erreur en environnement non
interactif. Les régressions `players.country`, pagination API puis `useLabels()` illustrent le coût.

Minimum recommandé :

- tests unitaires : `parseRound`, standings, zones, routes compétition, agrégats joueurs ;
- tests de contrat provider avec fixtures JSON, sans consommer l'API ;
- tests RLS Supabase : guest/member/admin ;
- Playwright mobile + desktop : accueil, compétition, classement, club, joueur, admin ;
- CI : install figée, lint, tests, build, audit dépendances et scan secrets.

Commencer par versionner une configuration ESLint explicite afin que `npm run lint` devienne
reproductible et non interactif.

### ARCH-02 — HAUT UX — Pas d'error boundary ni d'observabilité

Aucun `app/error.js`, `global-error.js` ou monitoring. Une erreur client produit donc le générique
« Application error ». Ajouter des boundaries avec bouton Réessayer, un identifiant d'incident et
une solution de monitoring. Ne pas exposer stack/secret au visiteur.

### SEO-01 — HAUT avant lancement éditorial

- `siteConfig.domain` vaut toujours `a-definir.be`, donc les canonical d'articles sont faux ;
- pages football principales en client components, sans metadata dynamique propre ;
- pas de sitemap, robots, manifest ni données structurées ;
- images importantes ont souvent `alt=""` ;
- aucun OG par compétition/club/joueur.

Les pages collections ont une meilleure base SEO, mais le cœur football doit être rendu/metadata
côté serveur ou via wrappers serveur.

### UI-01 — MOYEN — L'admin n'est pas réellement mobile

Le layout admin conserve un aside fixe de `w-56` dans une rangée flex sans variante mobile. Le site
public a été travaillé sur mobile, pas l'outil d'administration. Prévoir menu admin repliable et
tables/cartes mobiles avant usage régulier au téléphone.

### UI-02 — MOYEN — « Tout éditable » n'est pas encore uniforme

Accueil, page Belges, portail compétition, tuiles, sections club et Stats ont une configuration.
Mais beaucoup de textes restent codés en dur (notamment fiche joueur, états vides, matchs), et les
panneaux `media`, `seo`, `sync-errors`, `moderation`, `forum`, `io` sont partiellement placeholders
ou redondants. Faire un inventaire des clés éditoriales plutôt que d'ajouter des réglages au cas par
cas.

### UI-03 — MOYEN — Accessibilité à compléter

Ajouter labels accessibles aux selects/inputs iconiques, `aria-expanded` au menu, focus visible,
navigation clavier des rails, textes alternatifs utiles et vérification contraste. Tester au clavier
et avec axe/Lighthouse.

### ARCH-03 — MOYEN — Duplications et conventions instables

- `parseRound` est dupliqué ;
- calculs joueurs/compétitions sont répétés entre accueil, annuaire et fiches ;
- postes longs (`Goalkeeper`) et courts (`GK`) coexistent ;
- erreurs parfois affichées, parfois entièrement avalées ;
- plusieurs pages dépassent largement une taille raisonnable et mêlent chargement, calcul et UI.

Créer des services/selectors partagés et une convention unique pour poste, saison, phase, état de
chargement et erreur.

### PERF-02 — BAS/MOYEN — Média local lourd

`public/competition-banner.png` pèse environ **2,0 Mo**. Convertir en WebP/AVIF et fournir des tailles
responsive. La majorité des images externes est rendue avec `<img>` sans stratégie de chargement.

### LEGAL-01 — À prévoir avant ouverture publique

Le site propose comptes, contributions et potentiellement commentaires, mais aucune page visible de
mentions légales, confidentialité, règles de contribution/modération ou contact n'est présente dans
le footer. À traiter avant communication large, même sans publicité ni analytics.

---

## 6. Ce qui est réellement prêt

- portail Compétitions distinct des pages détail ;
- navigation directe Pro League / Croky Cup / Challenger ;
- championnat et coupe distingués ;
- rounds/phases génériques ;
- classement calculé par phase et zones configurables par saison/phase ;
- vue Calendrier/Liste responsive sur `/matchs` et dans la fiche compétition ;
- fiches club responsive avec sections et club parent/réserve ;
- fiches joueur enrichies ;
- page Belges à l'étranger configurable, annuaire conservé et import Burnley validé ;
- import ciblé d'une équipe et pagination API Free plafonnée à 3 ;
- compositions/performance match par match incrémentales et plafonnées ;
- données sportives séparées des choix éditoriaux via `locked`/`ext` ;
- clé service-role côté serveur uniquement ;
- build de production fonctionnel.

---

## 7. Roadmap recommandée après audit

### P0 — Sécurité immédiate

1. ~~Corriger RLS/permissions de `profiles` et adapter la promotion admin.~~ Codé ; appliquer `0002`.
2. ~~Assainir le HTML + sécuriser la modération des contributions/imports.~~ Codé.
3. Versionner et vérifier les policies Storage.
4. Mettre Next/Tiptap à niveau dans une branche dédiée.
5. Ajouter headers de sécurité et rotation/révocation de tous les anciens PAT.

### P1 — Fiabilité des données

1. Automatiser les migrations et produire `migration:status`.
2. Rattacher tous les matchs à une saison et backfill des données existantes.
3. Corriger `tracked` dans `syncSquads` et harmoniser `locked`.
4. Faire remonter toutes les erreurs DB/provider ; ajouter job locks/budget quota.
5. Corriger le traitement des réponses vides et la transaction événements.

### P2 — Qualité et passage à l'échelle

1. Tests + CI + secret scan + build obligatoire avant `main`.
2. Error boundaries et monitoring.
3. Pagination/agrégations Supabase et suppression des `select("*")` lourds.
4. Refactor des gros composants et selectors partagés.
5. Audit responsive admin + accessibilité.

### P3 — Produit

1. Finaliser l'accueil sur données réelles et le récap des Belges.
2. Mercato/statuts éditoriaux, scouting et actualités.
3. Challenger/réserves après validation des saisons/liaisons.
4. Europe belge + coefficient UEFA avec source vérifiable et override admin.
5. Nouvelles ligues étrangères par imports ciblés, puis plan API payant pour la saison courante.

---

## 8. Ordre de reprise conseillé à Claude

1. Lire `BELFOOT_HANDOFF.md`, puis ce rapport en entier.
2. Ne pas modifier le socle partagé ; les corrections Belfoot restent dans ce fork.
3. Appliquer et vérifier **SEC-01** avec trois sessions (anonyme, membre, admin) sur Supabase.
4. Tester **SEC-03** avec une vraie contribution en staging et confirmer le brouillon créé.
5. Traiter maintenant l'upgrade Next/Tiptap séparément pour faciliter le rollback.
6. Ne reprendre les features qu'après P0 et DATA-01/02/03.
7. Garder `BELFOOT_HANDOFF.md` et ce rapport à jour à chaque lot.
8. Avant chaque livraison : `git diff --check`, tests, build avec variables factices, commit ; push
   uniquement après autorisation explicite de l'utilisateur.

---

## 9. Commandes de vérification

```bash
# Qualité de patch
git diff --check

# Build reproductible sans secrets réels
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
npm run build

# Dépendances
npm audit --package-lock-only
npm outdated

# Recherche locale de secrets (compléter par gitleaks en CI)
rg --hidden --glob '!node_modules' --glob '!.git/**' \
  'ghp_|service_role|APIFOOTBALL_KEY=|JOBS_SECRET='
```

**État après premier lot de correction :** SEC-01 et SEC-03 sont corrigés dans le dépôt. SEC-01
nécessite encore l'application manuelle de `0002_profile_role_hardening.sql` sur l'instance ;
l'upgrade des dépendances (SEC-02), les policies Storage et les tests réels Supabase restent ouverts.
