# BELFOOT — Passation technique

> But de ce fichier : permettre à un autre modèle (ou dev) de **reprendre immédiatement** Belfoot
> à partir du repo, sans perte de contexte. À lire en entier avant de coder.
>
> Principe produit central : **image = décor / contenu = dynamique et administrable**.
> Le provider externe remplit la **donnée sportive** ; il ne doit **jamais** écraser les
> **choix éditoriaux/admin** (logos manuels, bannières, ordre, zones, textes, fonds de tuiles,
> relations de clubs, visibilité de blocs).

---

## 1. Vue d'ensemble

**Belfoot** = site football belge. Cœur produit : le **suivi des joueurs belges** (surtout à
l'étranger), avec l'actualité **autour** de cette logique data. C'est le **3ᵉ fork** du « socle »
(moteur réutilisable) après VCH (fan-hub GTA VI) et Flo Potez (vitrine maçonnerie). Belfoot part
d'un fork du socle et ne doit **pas** modifier le socle : les évolutions généralisables sont
listées en fin de fichier (SOCLE_CANDIDATES) mais **pas** remontées pour l'instant.

Compétitions V1 : **Jupiler Pro League** (championnat) + **Croky Cup** (coupe). Suivi ciblé des
Belges à l'étranger + actu. Le reste vient plus tard.

---

## 2. Stack technique

- **Next.js 14** (App Router, `app/`), React 18, JavaScript (pas de TypeScript).
- **Tailwind CSS** avec des **tokens CSS** (thème clair/sombre) : couleurs `accent`, `bg`,
  `surface`, `surface2`, `content`, `muted`, `line` (voir `app/globals.css` + `tailwind.config.js`).
- **Supabase** (Postgres + Auth + Storage). Projet Supabase dédié « Joueurs Belge »
  (ref `pfyugigtqkqhgwxbzsdv`).
- **Vercel** (hébergement + déploiement auto sur push `main`).
- Dépendances notables : `@supabase/supabase-js`, `lucide-react`, `@tiptap/*` (éditeur riche des
  collections éditoriales).
- **Aucune librairie de drag&drop** (reorder = boutons ↑/↓ ou HTML5 natif). Pas de state manager
  externe (React state + hooks).

Workflow de dev habituel : l'assistant édite dans un sandbox → `npm run build` → commit →
l'utilisateur crée un **token GitHub classic usage-unique (scope `repo`)** → push sur `main` en
première action → Vercel redéploie. Les migrations SQL sont passées **à la main** dans le SQL
Editor de Supabase (⚠️ **migration d'abord, rechargement du site ensuite**).

---

## 3. Structure des dossiers

```
app/                     pages (App Router)
  page.js                accueil (placeholder — home Belfoot pas encore construite)
  layout.js              layout racine (ThemeModeProvider, Navbar, Footer, accent injecté)
  globals.css            tokens de thème + styles .rich (éditeur) + scope [data-force-dark] (admin)
  competitions/          liste + [slug] (LA page riche : header, onglets, stats…)
  matchs/                liste (phase-aware) + [id] (fiche match + timeline)
  clubs/[id]/            fiche club (sections pliables + config admin)
  players/[id]/          fiche joueur (stats saison)
  classement/           classement global (sélecteur compétition + phase, calcul client)
  [collection]/          pages génériques des collections éditoriales (news…)
  recherche/            recherche unifiée
  login / reset / compte / auth/callback   auth (OAuth + email)
  admin/                 shell admin (layout forcé sombre) + [key] (routeur de panneaux)
  api/jobs/[key]/        runner de jobs protégé par JOBS_SECRET (cron)
  api/admin/run-job/     runner de jobs déclenché depuis l'admin (auth = rôle admin via JWT)
config/
  site.js                identité, thème, locales, modules, flags, auth (providers OAuth)
  collections.js         collections éditoriales déclaratives (moteur socle)
  modules.js             modules métier activés (football, votw, forum, fm)
  football-admin.js      SPEC des entités football pour l'admin générique (EntityManager)
  admin.js               structure de l'admin (sections + panneaux) — Belfoot
lib/
  supabaseClient.js      client anon (browser + server components)
  supabaseAdmin.js       client service-role (SERVEUR uniquement, getAdmin(), lazy) — bypass RLS
  auth.js                useAuth() (session + rôle)
  entries.js             CRUD collections éditoriales (table entries) + soft delete
  standings.js           computeStandings(matches) — classement calculé client
  labels.js              useLabels() -> L(key, fallback), textes administrables
  tiles.js               useTiles() -> config visuelle des tuiles (fond/overlay/accent/enabled)
  clubSections.js        config des sections de fiche club (enable/ordre)
  jobs.js                registre des background jobs + runJob(key, ctx)
  modules.js             registre unifié (collections + modules) : adminPanels/navItems/capabilities
  media.js               abstraction upload (Supabase Storage bucket "media") + compression
  seo.js, flags.js, permissions.js, io.js, interactions.js, contributions.js, categories.js, slugify.js
components/
  Navbar/Footer/ThemeModeProvider/CategoryBadge/RichContent/CollapsibleSection
  auth/OAuthButtons.js
  football/  MatchRow, StandingsTable, CompetitionHeader, SeasonCalendar, Watermark
  admin/     EntityManager (CRUD générique tables métier), CollectionManager (contenus éditoriaux),
             registry.js (clé de panneau -> composant), panels.js (Jobs/Profils/Signalements/
             Providers/Textes/Tuiles/FicheClub/SettingsInfo…), Dashboard, CategoriesManager,
             ContributionsQueue, FieldInput, SortableList, ui/{ImageField,GalleryField,SaveStatus}
modules/
  football/  manifest, providers.js (contrat), apifootball.js, thesportsdb.js (secondaire),
             syncCompetition.js, syncSquads.js, syncEvents.js, discoverPlayers.js, trackPlayers.js,
             jobs/{sync,liveSync,squads,events,discoverBelgians,trackPlayers}.js, admin/, migrations/
  votw/      "11 de la semaine" — design + schéma, désactivé
  forum/     forum optionnel — manifest + schéma, désactivé
  fm/        Football Manager (verticale future) — manifest stub, désactivé
supabase/
  schema.sql             socle : profiles, entries, site_settings, categories, contributions,
                         interactions (comments/votes/reports), schema_migrations, audit_log,
                         job_runs, RLS, trigger handle_new_user (auto-profil à l'inscription)
  migrations/0001_core.sql   copie du core
```

---

## 4. Variables d'environnement (⚠️ ne jamais committer les valeurs)

Sur Vercel (Production + Preview) :
- `NEXT_PUBLIC_SUPABASE_URL` — URL du projet Supabase (`https://pfyugigtqkqhgwxbzsdv.supabase.co`).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — clé anon **public** (type **Config**, pas Secret : les
  `NEXT_PUBLIC_*` doivent être exposées au client au build).
- `NEXT_PUBLIC_ADMIN_EMAIL` — email admin (indicatif).
- `SUPABASE_SERVICE_ROLE_KEY` — **secret**, serveur uniquement (jobs, bypass RLS). SANS `NEXT_PUBLIC_`.
- `JOBS_SECRET` — protège l'endpoint `/api/jobs/[key]` (cron).
- `APIFOOTBALL_KEY` — clé API-Football (provider principal).
- `THESPORTSDB_KEY` — provider secondaire/test (défaut `3`).

Piège vécu : mettre une `NEXT_PUBLIC_*` en type **Secret** sur Vercel → le client reçoit `undefined`
→ client Supabase cassé → 500. Toujours en **Config**. Et **redeploy sans cache** après un changement d'env.

---

## 5. Base Supabase — tables importantes

**Socle** (`supabase/schema.sql`) : `profiles` (id, username, role member|admin), `entries`
(contenus éditoriaux polymorphes : collection, title, slug, body, cover_url, images, category, seo,
published, **deleted_at** soft-delete, search tsvector `'simple'`), `site_settings` (id=1, `data`
jsonb — y vivent **labels/tiles/club_sections**), `categories`, `contributions`, `comments/votes/
reports` (interactions polymorphes target_type/target_id), `schema_migrations`, `audit_log`,
`job_runs`. RLS partout (lecture publique du publié, écriture admin via `is_admin()`).
Trigger `handle_new_user` : crée un `profiles` (role member) à chaque inscription.

**Football** (`modules/football/migrations/*`) :
- `competitions` : id, name, slug, provider ('apifootball'|'thesportsdb'), **external_id** (id ligue
  provider), logo_url, **banner_url** (décor), **zones** jsonb `[{label,color,from,to}]`, **position**
  (ordre, 0=premier), **rating_min** (seuil apparitions pour classement des notes),
  **competition_type** ('league'|'cup'), **public_visible** (permet de synchroniser une ligue
  étrangère sans l'afficher dans les sélecteurs publics), source/**locked**/synced_at/**ext** (jsonb : coverage,
  country, country_flag, providerName, season…).
- `clubs` : name, short_name, city, logo_url, **team_type** (first_team|reserve|u23|women),
  **parent_club_id** (réserves/U23), source/external_id/locked/synced_at/ext.
- `players` : name, club_id, position (Goalkeeper/Defender/Midfielder/Attacker), number,
  nationality, **country** (pays du championnat), competition, age, birth_date, photo_url, active,
  **tracked**, source/external_id/
  locked/synced_at/ext.
- `coaches` : name, club_id, photo_url.
- `seasons` : competition_id, label, **zones_by_phase** jsonb (`{ "Regular Season": [...] }`) pour
  isoler les règles de classement par saison et phase.
- `matches` : competition_id, season_id, home_club_id, away_club_id, home_score, away_score,
  status (scheduled|live|finished|postponed), minute, kickoff, source/external_id/locked/synced_at,
  **round_raw** (libellé provider brut), **phase** (ex. "Regular Season"), **round_number**,
  matchday (= round_number), provider, ext.
- `match_events` : match_id, minute, type (goal|assist|yellow|red|sub), player_id, club_id,
  **player_name/assist_name/detail** (dénormalisés, timeline lisible), source.
- `player_season_stats` : player_id, competition_id, season, appearances, lineups, minutes, goals,
  assists, yellow, red, rating, source/external_id/synced_at,
  **unique(player_id,competition_id,season)** depuis la migration `0012`.
- Vues dérivées : `standings`, `top_scorers`, `top_assists` (⚠️ **phase-blind** : on privilégie le
  **calcul client** `lib/standings.computeStandings` scoppé par phase, cf. pièges).

`votw`, `forum` = schémas définis mais **modules désactivés**.

---

## 6. Migrations (fichiers présents)

Socle : `supabase/schema.sql` (= `supabase/migrations/0001_core.sql`).
Football : `modules/football/migrations/0001_init` → `0015_season_phase_zones` (init, players_tracking,
competition_slug, player_stats, players_events, events_names, rounds_phases, competition_position,
banner_zones, rating_min, types_relations, statistiques joueur séparées par compétition, textes
éditoriaux des bandeaux de compétition, visibilité publique des compétitions, pays du joueur,
zones de classement par saison/phase).
Autres : `modules/votw/migrations/0001_init`, `modules/forum/migrations/0001_init`.

⚠️ **Migrations passées à la main** dans Supabase. Le code est tolérant (tri client, fill-if-empty)
mais certaines fonctions restent inactives tant que la colonne n'existe pas. **Vérifier que TOUTES
les migrations football 0001→0015 sont passées** sur le projet (surtout position/banner/zones/
rating_min/competition_type/parent_club_id/team_type et `0012` avant toute nouvelle synchro des
effectifs/stats, puis `0013` pour éditer les titres de bandeau). Une colonne manquante n'affiche plus de page
blanche (résilience ajoutée) mais désactive la feature liée.

---

## 7. API-Football & sync

**Provider principal = API-Football (`v3.football.api-sports.io`)** via `modules/football/apifootball.js`
(header `x-apisports-key`). TheSportsDB = secondaire (contrat identique, `thesportsdb.js`).

**IDs provider utilisés** : Jupiler Pro League `external_id = 144`, Croky Cup `external_id = 147`,
provider `apifootball`. **Saison de dev = 2024** (le plan **gratuit** ne donne accès qu'aux saisons
**2022→2024** ; 2026 = plan payant). Le champ Saison des jobs accepte `2024` ou `2024-2025` (on
extrait l'année).

**Contrat provider** (`providers.js`) : un provider expose `{ key, fetchLeagueInfo, fetchClubs,
fetchMatches, fetchLiveMatches, fetchSquadPlayers, fetchPlayerSeason, fetchEvents }`. Chaque
compétition choisit son provider (colonne `provider`) → **aucune logique JPL en dur**, multi-sources.

**Orchestrateurs** : `syncCompetition` (mode full = clubs dérivés des matchs + enrichis + tous les
matchs + coverage + logo/nom/pays/drapeau si vide ; mode live = matchs en direct only),
`syncSquads` (effectifs + `player_season_stats` scoppées par compétition/saison en même temps,
0 requête en plus — met `tracked=true`),
`syncEvents` (événements par match, incrémental + plafonné 40/run), `discoverBelgians`/`trackPlayers`
(suivi belges à l'étranger : discovery limitée aux clubs de la compétition demandée + tracking
ciblé `tracked=true`, tous deux scoppables avec `competitionId`).

**Jobs** (`lib/jobs.js`) : `football.sync`, `football.live-sync`, `football.squads`,
`football.events`, `football.discover-belgians`, `football.track-belgians`. Chaque job accepte un
`competitionId` (sinon : toutes) → **sync indépendante par compétition** (« Sync Pro League » vs
« Sync Croky Cup »). Déclenchement :
- Admin → **Données & sync → Jobs** : sélecteur de compétition + saison + boutons (route
  `/api/admin/run-job`, sécurisée par **rôle admin via JWT**, aucun secret côté client).
- `/api/jobs/[key]?season=&competitionId=` protégée par `JOBS_SECRET` (pour cron Vercel).
Les jobs écrivent via le client **service-role** (`getAdmin()`), seul moyen de contourner la RLS
côté serveur. Le rapport de job affiche le **nom réel de la ligue** (auto-vérification de l'id) +
compteurs. Traces dans `job_runs` + Dashboard.

**Coverage flags** : stockés dans `competitions.ext.coverage` (via `/leagues`). Gating : la sync
effectifs/events ne s'exécute que si la ligue expose la donnée.

**Rounds/phases (générique)** : `league.round` provider (ex. "Regular Season - 1", "8th Finals") est
parsé en `round_raw` + `phase` + `round_number`. Groupement/stats se font **par phase + tour** →
championnat (journées) ET coupe (tours) sans hardcode ; les barrages ne polluent pas les stats du
championnat principal.

---

## 8. Protection données manuelles vs provider (RÈGLE À NE PAS CASSER)

- Champs **owned by provider** (upsert par `(source, external_id)`) : name/logo/score/status… Ils
  sont écrasés à chaque sync **sauf** si la ligne est **`locked = true`** (verrou global, admin).
  `upsertExternal` **saute** toute ligne verrouillée.
- `competitions.logo_url` : rempli par la sync **seulement si vide** → **logo manuel prioritaire**.
- **Jamais touchés par la sync** (hors `source/external_id/ext/synced_at/owned`) : `banner_url`,
  `zones`, `position`, `competition_type`, `rating_min`, `parent_club_id`, `team_type`, et tout ce
  qui vit dans `site_settings.data` (**labels, tiles, club_sections**). C'est structurel : ces
  champs ne sont pas dans les `ownedFields` des upserts.
- `ext` (jsonb) = payload brut provider **isolé** des champs éditoriaux.

**À NE PAS FAIRE** : ajouter `logo_url`, `banner_url`, `zones`, etc. aux `ownedFields` d'un upsert ;
faire écrire la sync dans `site_settings.data` ; ré-injecter `data/images/seo` dans les entités
football (bug déjà corrigé dans EntityManager).

---

## 9. Systèmes administrables (image=décor / contenu=dynamique)

- **Textes** (`lib/labels.js` + admin Réglages → Textes) : `L(key, fallback)` partout. Surcharge
  dans `site_settings.data.labels`. Défauts inline dans le code (marche sans config).
- **Bannière compétition** : `competitions.banner_url` (décor, aucun texte intégré). Défaut
  `public/competition-banner.png`. Header = overlay HTML/CSS (`CompetitionHeader`). Son titre et son
  sous-titre sont modifiables par compétition avec `header_title`/`header_subtitle` ; les valeurs
  vides retombent automatiquement sur le nom puis sur « pays · saison ».
- **Logos** : compétition `logo_url` (auto si vide, sinon manuel prioritaire) ; clubs `logo_url`
  (auto, protégé par verrou).
- **Fonds de tuiles** (`lib/tiles.js` + admin Réglages → Tuiles) : par tuile (`topscorer`,
  `topassist`, `cleansheet`, `note`, `upcoming`) → `background_url`, `overlay`, `accent`, `enabled`.
  Stocké dans `site_settings.data.tiles`. Accents par défaut si non défini.
- **Ordre des compétitions** : `competitions.position` (0 = premier). Tri **côté client** partout
  (fallback nom) — `/competitions`, `/matchs`, `/classement`, sélecteurs.
- **Zones de classement** : `competitions.zones` = `[{label,color,from,to}]`, éditeur dédié en admin
  reste le fallback historique. La configuration active vit dans `seasons.zones_by_phase` et se
  modifie dans Admin → Football → Saisons. Rendu = rang coloré + légende (`StandingsTable`) +
  positions colorées dans le Top 5. Une phase absente n'hérite d'aucune autre phase.
- **Fiche club — sections** (`lib/clubSections.js` + admin Réglages → Fiche club) : activer/masquer/
  ordonner (Effectif, Équipes liées, Derniers matchs, Prochains matchs). Côté visiteur : sections
  **pliables/dépliables** (préférence mémorisée en `localStorage`). Masquer ≠ supprimer.

---

## 10. Pages publiques existantes

Accueil `/` (placeholder). `/belges-a-l-etranger` (première page cœur produit : joueurs belges
suivis hors Belgique, recherche, filtres pays/championnat/poste, cartes club + stats saison,
état vide exploitable). `/competitions` (liste, client, état chargement/erreur explicite, type
Championnat/Coupe) + `/competitions/[slug]` (header overlay, onglets Vue d'ensemble / Matchs /
Classement pour une ligue ou Tours pour une coupe / Clubs / Joueurs / Stats, sélecteur de saison,
fond global discret, poussoir direct entre les compétitions qui conserve l'onglet courant). Les
matchs, classements, clubs et chiffres de cette page sont scoppés par la saison sélectionnée.
`/matchs` (sélecteur compétition + saison + phase, vraie vue Calendrier avec navigation entre
journées/tours + ancienne vue Liste) + `/matchs/[id]` (fiche + timeline lisible). `/classement`
(sélecteur compétition + saison + phase,
calcul client, zones). `/clubs/[id]` (entraîneur en tête + sections pliables). `/players/[id]` (stats
saison). `/recherche` (unifiée). Auth : `/login` (OAuth Google/Twitch/Discord + email + inscription +
mot de passe oublié), `/reset`, `/compte`, `/auth/callback` (redirige selon rôle). `/[collection]`
+ `/[collection]/[slug]` (contenus éditoriaux génériques, ex. `news` → `/actus`). `/proposer/[collection]`
(contribution membre).

**Vue d'ensemble compétition** : Top 5 (forme V/N/D + positions colorées par zone + légende),
Résultats (dernière journée complète, couleurs V/N/D, glow score), Prochains matchs (état vide propre
« Saison terminée »/« Aucun match à venir »), bloc **Leaders** (Meilleur buteur / Meilleur passeur /
**Clean sheets gardien**, cartes premium cliquables → ancres Stats `#buteurs/#passeurs/#cleansheets`),
bloc **Autres statistiques** (Club en forme, Meilleure attaque/défense), chiffres secondaires.
**Stats** : grille 3×2 (Buteurs, Passeurs, Clean sheets GK, Minutes, Titularisations, Meilleures
notes) avec leader mis en avant (or/argent/bronze) ; notes filtrées par `rating_min`.

**Comportement Coupe** : le type effectif est déterminé par `competition_type`, le type remonté par
le provider (`ext.providerType`) ou, pour les anciennes lignes, les libellés de tours. Une coupe ne
produit jamais de classement à points. Dans `/classement`, elle affiche une vue par tours/matchs ;
sur sa page, l'onglet « Classement » devient « Tours ». La Vue d'ensemble remplace le Top 5 et les
statistiques de championnat par le tour sélectionné et ses chiffres. Implémentation générique dans
`lib/competitionType.js` + `components/football/CupRounds.js` (aucun nom de compétition en dur).

**Routes compétition** : tous les liens passent par `lib/competitionRoutes.js`. L'URL publique est
normalisée (`Croky Cup` → `/competitions/croky-cup`) même si une ancienne ligne possède un slug avec
espaces/majuscules. La page détail résout aussi les anciens slugs, l'identifiant et le nom normalisé :
aucune correction de donnée ou migration n'est requise pour conserver les anciens accès.

---

## 11. Admin existant

Shell forcé sombre (`app/admin/layout.js`, `[data-force-dark]`), garde d'accès (rôle admin).
Sections (`config/admin.js`) : **Tableau de bord** ; **Éditorial** (Actualités, Catégories,
Contributions) ; **Football** (Compétitions, Saisons, Clubs, Joueurs, Entraîneurs, Matchs,
Événements — via `EntityManager` + spec `config/football-admin.js`) ; **Données & sync** (Providers,
Jobs [sélecteur compétition + saison + run], Historique sync, Erreurs) ; **Communauté** (Profils,
Signalements, Modération, Forum) ; **Réglages** (Configuration, Modules, Feature flags, Médias, SEO,
**Textes**, **Tuiles**, **Fiche club**). `EntityManager` : CRUD générique piloté par spec (types de
champ : text, number, bool, image, select, relation **recherchable**, datetime, zones…), regroupement
(Joueurs par club) + recherche, affichage source/verrou/synchro, auto-slug.

---

## 12. Auth

OAuth Google/Twitch/Discord (repris de VCH, neutralisé, générique via `siteConfig.auth.providers`)
+ email/mot de passe + reset. Flux implicite (redirectTo `/auth/callback` qui redirige selon rôle :
admin→`/admin`, sinon→`/compte`). `handle_new_user` crée le profil. Promotion admin manuelle :
`update profiles set role='admin' where id=(select id from auth.users where email=...)`.
URLs à configurer côté providers : redirect URI = `https://<REF>.supabase.co/auth/v1/callback`.
Côté Supabase : Site URL = domaine + Redirect URLs (`/auth/callback`, `/reset`, localhost).

---

## 13. Bugs connus / pièges à NE PAS casser

- **Vues SQL `standings`/`top_scorers`/`top_assists` sont phase-blind** (mélangent championnat +
  barrages). Le front utilise le **calcul client par phase** (`computeStandings`) — ne pas revenir
  aux vues pour l'affichage compétition.
- **Meilleure attaque/défense** : filtrer sur un **nombre de matchs représentatif** (sinon un club à
  2-3 barrages ressort). Déjà fait (`eligible = played >= max(3, maxPlayed*0.5)`).
- **Clean sheets = gardien** : on n'a **pas** les compos par match → clean sheets club attribués au
  **GK n°1** (plus de minutes). Heuristique assumée ; à améliorer quand les lineups par match seront
  synchronisées.
- **Notes** : seuil d'apparitions `rating_min` obligatoire (sinon un joueur à faible temps de jeu
  ressort premier).
- **Stats joueur par compétition** : le front filtre toujours `player_season_stats` par
  `competition_id` + saison. Ne jamais revenir à une map par `player_id` seul. La migration `0012`
  doit être passée avant les jobs `football.squads`/`football.track-belgians`, puis il faut relancer
  ces jobs pour chaque compétition afin de reconstruire les lignes séparées. Les anciennes lignes
  sans `competition_id` restent visibles comme « Non attribuée » sur la fiche joueur, mais sont
  volontairement ignorées sur les pages compétition.
- **Classements multi-saisons** : ne jamais appliquer directement `competitions.zones` à toutes les
  phases. Utiliser `zonesForPhase(competition, season, phase, primaryPhase)`. Depuis `0015`, une
  phase absente de `seasons.zones_by_phase` n'affiche aucune couleur. Les pages compétition,
  `/classement` et `/matchs` filtrent aussi les matchs via `season_id`.
- **Ne pas trier en base par une colonne potentiellement absente** (ex. `order("position")`) → tri
  **client** avec fallback, sinon page vide si migration en retard.
- **`NEXT_PUBLIC_*` en Secret sur Vercel** = 500. Toujours Config + redeploy sans cache.
- **`getAdmin()`/service-role** : SERVEUR uniquement (jamais importé côté client). Les jobs échouent
  sans lui (RLS bloque les écritures anon).
- **EntityManager** : ne pas réintroduire l'injection `data/images/seo` (colonnes inexistantes sur
  les tables football → erreur « Could not find the 'data' column »).
- **Quota API-Football gratuit** : effectifs = 1 requête/club (paginé) → l'import des ~18 clubs peut
  taper la limite (100/jour). Étaler, ou sync par compétition. Saisons gratuites 2022→2024 seulement.
- **Bannière** ~2 Mo (`public/competition-banner.png`) : à compresser/WebP un jour.

---

## 14. TODO ouverts (par priorité indicative)

1. **Fiche club — blocs administrables complets** : ajouter les sections manquantes (Identité détaillée,
   Classement du club, Stats club, Stade, Palmarès) au système `clubSections` (activer/ordre + pliable).
2. **Synchro entraîneurs** depuis le provider (table `coaches` remplie manuellement pour l'instant ;
   afficher l'entraîneur actuel, surchargeable admin).
3. **Équipes liées / réserves / U23** : peupler `parent_club_id`/`team_type` (mapping provider) ; la
   section « Équipes liées » s'affiche déjà si des relations existent.
4. **Suivi des Belges à l'étranger** (cœur produit) : exercer `discover-belgians` + `track-belgians`,
   page annuaire V1 construite ; prochaine étape = ajouter les compétitions étrangères masquées,
   exercer les jobs, puis construire le top/récap des Belges du week-end.
5. **Lineups par match** (compos) → clean sheets GK exacts + titularisations réelles par match.
6. **Home Belfoot** (pas encore construite) : hero « Les Belges. Partout dans le monde. », blocs
   JPL / Croky / Belges à suivre / en forme / Belge du moment / actus.
7. **Passer en plan payant** API-Football pour la saison courante (le code est prêt : changer `season`).
8. Régler les Zones JPL par saison/phase. Pour la Croky, renseigner idéalement Type = `cup` en admin ; le front est
   désormais résilient et la détecte aussi via le provider/les tours si cette valeur manque encore.

---

## 15. Dernières décisions produit / UI

- Header compétition : logo plus gros, drapeau pays, liseré tricolore belge subtil, style sombre/premium.
- Fond global discret sur la page compétition (profondeur, liant entre blocs).
- Tuiles leaders : contour d'accent gardé **même avec image de fond** ; filigranes teintés
  (ballon doré / chaussure rouge / gant cyan / étoile violette) ; **fonds administrables** (accent,
  overlay, image, on/off).
- Leaders = Meilleur buteur / Meilleur passeur / **Clean sheets gardien** (la note reste en Stats).
- « Voir tout » et cartes de la Vue d'ensemble **restent dans la compétition courante** (onglets +
  ancres), plus jamais de saut vers une autre compétition.
- Résultats/Prochains matchs en **mode compact**, blocs à **hauteur égale**.
- Sync **indépendante par compétition** ; aucune compétition « par défaut » dans le code.

---

## HOW_TO_RESUME

```bash
# 1. Installer
npm install

# 2. Env local (ne pas committer)
cp .env.local.example .env.local   # remplir avec les clés Supabase + APIFOOTBALL_KEY…

# 3. Lancer en dev
npm run dev                        # http://localhost:3000

# 4. Build (toujours vérifier avant de pousser)
npm run build

# 5. Migrations : SQL Editor de Supabase, dans l'ordre :
#    supabase/schema.sql (socle), puis modules/football/migrations/0001_init → 0011.
#    (⚠️ migration d'abord, rechargement du site ensuite)

# 6. Git : brancher, committer, pousser sur main -> Vercel redéploie
git add -A && git commit -m "..."
git push origin main
```

**Où sont les pièces clés** : provider API-Football = `modules/football/apifootball.js` ;
orchestrateurs = `modules/football/sync*.js` ; jobs = `modules/football/jobs/` + `lib/jobs.js` ;
runners = `app/api/jobs/[key]/route.js` (secret) + `app/api/admin/run-job/route.js` (rôle admin) ;
classement client = `lib/standings.js` ; header = `components/football/CompetitionHeader.js` ;
ligne de match = `components/football/MatchRow.js` ; classement UI = `components/football/StandingsTable.js` ;
admin générique = `components/admin/EntityManager.js` + `config/football-admin.js` ;
panneaux admin = `components/admin/panels.js` + `registry.js` ; page compétition (la plus riche) =
`app/competitions/[slug]/page.js` ; détection ligue/coupe = `lib/competitionType.js` ; vue tours de
coupe = `components/football/CupRounds.js` ; URL/résolution rétrocompatible des compétitions =
`lib/competitionRoutes.js`.

---

## CHANGELOG_DE_PASSATION

### 2026-09-17 — ChatGPT — vraie vue calendrier

- `/matchs` s'ouvre désormais en vue Calendrier, avec une bascule vers la vue Liste historique.
- Bandeau de journées/tours horizontal et responsive : vert = terminé, jaune = à venir, rouge =
  direct. La première journée non terminée est sélectionnée automatiquement ; si tout est terminé,
  la dernière journée s'ouvre.
- Carte centrale avec précédent/suivant, plage de dates, compteur de rencontres terminées/directes,
  date et heure de chaque match. Le composant est générique et reste compatible avec les phases de
  championnat et de coupe.
- Filtres compétition, saison et phase conservés ; chaque changement réinitialise proprement la
  journée sélectionnée. Aucune migration supplémentaire.
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices de compilation +
  `git diff --check` réussi. Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — zones de classement par saison et phase

- Correction du bug où les couleurs de la saison régulière restaient actives dans les Champions,
  Europe et Relegation Play-offs. La cause était `competitions.zones`, unique pour toute l'histoire
  et toutes les phases de la compétition.
- Migration `0015_season_phase_zones.sql` : ajout de `seasons.zones_by_phase`. Transition des zones
  existantes vers `Regular Season` pour les saisons antérieures à 2026 ; aucune règle 16 clubs
  n'est copiée vers 2026-2027.
- Nouvel éditeur Admin → Football → Saisons → Zones par phase. Les noms correspondent exactement
  aux phases provider ; une phase non configurée n'affiche aucune zone ni légende.
- Les pages compétition, `/classement` et `/matchs` filtrent désormais réellement les rencontres
  avec `season_id`. Les sélecteurs choisissent la saison la plus récente et réinitialisent phase/tour.
- Préparation du format JPL 2026-2027 : 18 clubs, 34 journées, aucun playoff ; les zones pourront
  être définies uniquement sur `Regular Season` (Europe 1-4, relégation 17-18 selon la règle
  officielle), sans toucher aux anciennes saisons.
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices de compilation +
  `git diff --check` réussi. Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — annuaire des Belges à l'étranger V1

- Nouvelle page `/belges-a-l-etranger`, accessible par « Belges » dans la navigation : joueurs
  belges suivis hors Belgique uniquement, recherche, filtres pays/championnat/poste, regroupement
  de leurs statistiques de la saison la plus récente et état vide explicite avant import.
- Migration `0014_belgians_abroad.sql` : ajout de `players.country` et de
  `competitions.public_visible` (vrai par défaut), avec index de lecture du suivi.
- Une compétition étrangère peut désormais rester disponible dans l'admin et les jobs tout en étant
  masquée du hub Compétitions, du poussoir, de Matchs et de Classement.
- La découverte des Belges est maintenant réellement scoppée : seulement les clubs de la
  compétition choisie, `leagueId` transmis au provider et `competitionId` respecté par le job. Cela
  évite de brûler le quota sur tous les clubs partageant le même provider.
- Correction visuelle mobile du classement : les positions sans zone utilisent un gris ardoise
  lisible ; elles ne ressemblent plus à la zone noire « Relégable ». Navigation rendue défilable
  horizontalement pour accueillir « Belges » sur petit écran.
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices de compilation +
  `git diff --check` réussi. Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — navigation et finition des pages compétition

- Ajout sous le bandeau d'un poussoir visuel avec logo pour passer directement de la Pro League à
  la Croky Cup (et aux futures compétitions), dans l'ordre administrable `position`. L'onglet courant
  est conservé ; « Classement » devient naturellement « Tours » pour une coupe.
- Migration `0013_competition_header_texts.sql` : `header_title` et `header_subtitle` sont éditables
  dans Admin → Football → Compétitions. Ils ne sont pas possédés par le provider et ne sont donc
  jamais écrasés par une synchronisation. Valeurs vides = fallback nom puis pays/saison.
- Correction visuelle des zones : une position sans zone reçoit maintenant un état neutre lisible,
  au lieu d'une pastille noire pouvant faire croire que la 5e place était relégable. Les bornes
  `from`/`to` sont converties et validées explicitement.
- La tuile Top 5 occupe désormais toute sa hauteur sans afficher artificiellement les 16 équipes.
  Le classement complet et les lignes de résultats ont reçu une finition légère : rangs, points,
  contraste du vainqueur, score central, survol et comportement horizontal mobile.
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices de compilation +
  `git diff --check` réussi. La validation finale sur données réelles reste à faire après déploiement.
- Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — statistiques séparées par compétition

- Reproduction visuelle sur la page Croky : les cartes Leaders reprenaient les chiffres Pro League
  (ex. 21 buts/12 passes), car les stats étaient chargées par joueur sans filtre compétition.
- La page compétition filtre désormais les stats par `competition_id` et par année de saison ; une
  donnée absente produit `—` au lieu d'afficher une statistique provenant d'une autre compétition.
- Migration `0012_stats_by_competition.sql` : remplacement de l'unicité `(player_id, season)` par
  `(player_id, competition_id, season)` + index compétition/saison.
- `syncSquads` et `trackPlayers` utilisent la nouvelle clé d'upsert et remontent les erreurs SQL au
  lieu d'annoncer silencieusement un succès. Le tracking peut être scoppé par compétition et filtre
  la réponse API-Football sur l'ID de la ligue/coupe.
- La fiche joueur affiche maintenant la compétition de chaque ligne statistique ; les anciennes
  lignes non scoppées sont libellées « Non attribuée ».
- **Ordre de mise en production obligatoire** : appliquer `0012`, puis lancer `football.squads`
  avec saison `2024` séparément pour Pro League et Croky Cup. Les anciennes lignes ayant pu être
  écrasées, les deux synchronisations sont nécessaires.
- Vérification : `npm run build` réussi sous Next.js 14.2.35 + `git diff --check` réussi.
- Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — accès canonique aux pages de compétition

- Reproduction sur le site public : la carte Croky Cup existait, mais pointait vers
  `/competitions/Croky Cup` et finissait sur « Compétition introuvable ».
- Centralisation des liens compétition avec une URL normalisée (`/competitions/croky-cup`).
- Résolution rétrocompatible par slug exact, identifiant, slug normalisé ou nom normalisé ; le
  correctif fonctionne pour les futures compétitions sans nom codé en dur.
- Liens corrigés dans `/competitions` et dans l'appel à la page complète depuis `/classement`.
- Comportement coupe conservé et vérifié : sélection par tours, finale par défaut, aucun classement
  à points, onglet « Tours », matchs et clubs reliés à la compétition.
- Nouvelle migration : **aucune**.
- Vérification : `npm run build` réussi sous Next.js 14.2.35 + `git diff --check` réussi.
- Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — cohérence championnat/coupe

- Reproduction sur le site public : Croky Cup visible dans `/competitions`, mais `/classement`
  fabriquait un faux classement du 1er tour (140 clubs, victoire = 3 points).
- Ajout d'une détection générique du format (`competition_type` → type provider → analyse des tours).
- API-Football conserve maintenant `league.type` dans `competitions.ext.providerType`, sans écraser
  `competition_type` ni aucun choix admin.
- `/classement` affiche les matchs tour par tour pour une coupe, jamais `J/G/N/P/Pts`.
- Page compétition : onglet « Tours », tour le plus récent par défaut, Vue d'ensemble adaptée aux
  éliminations directes, suppression des blocs Top 5/meilleure attaque/défense pour les coupes.
- `/competitions` : chargement et erreurs explicites + libellé Championnat/Coupe.
- Nouvelle migration : **aucune**.
- Vérification : `npm run build` réussi sous Next.js 14.2.35.
- Socle : **aucune modification**.

---

## CURRENT_GIT_STATE

- **Branche** : `main`
- **Dernier commit fonctionnel** : `0642506` — vraie vue calendrier avec navigation entre les
  journées/tours, dates et états.
- **Commit précédent** : `4f9d5ad` — documentation des formats de classement.
- **Commits importants récents** :
  - `0642506` calendrier responsive + navigation + bascule liste
  - `819ba40` migration `0015` + zones saison/phase + filtres saison sur Compétition/Classement/Matchs
  - `39c6522` page Belges + migration `0014` + visibilité publique + discovery économe
  - `0f75661` navigation directe Pro League/Croky + migration `0013` + finition des cartes
  - `14cd294` migration `0012` + stats compétition/saison + tracking scoppé + fiche joueur enrichie
  - `fa4aaf9` liens compétition centralisés + résolution des anciens slugs/IDs/noms
  - `47be978` distinction générique ligue/coupe + vue tours Croky + erreurs de chargement explicites
  - `df59dfa` header/identité + fond global + tuiles (accent/enabled) + dates journées
  - `a0512b2` fix Croky Cup (/competitions en client) + relation recherchable + clean sheets GK +
    tuiles premium + Vue d'ensemble premium
  - `64c60d9` sync indépendante par compétition + tuiles/fonds admin + logo manuel prioritaire +
    competition_type + fondation équipes liées + entraîneur
  - `8a665d8` fiche club en sections pliables + config admin (activer/ordre)
  - `5d57095` cartes cliquables → ancres Stats + note fiabilisée (seuil) + clean sheets
  - `a6213f5` rounds/phases génériques (fin du mélange journées/barrages)
  - `39267e2`/`150db4d` couche compétition (effectifs+stats, événements, journées, fiches)
- **Migrations encore à passer** (si le projet Supabase n'est pas à jour) : `0012` est indiquée
  comme appliquée par l'utilisateur ; vérifier `0013_competition_header_texts.sql`, puis appliquer
  `0014_belgians_abroad.sql`, puis `0015_season_phase_zones.sql`, et vérifier que
  `modules/football/migrations/0001→0015` sont
  **toutes** passées (surtout `0008` position, `0009` banner_url/zones, `0010` rating_min,
  `0011` competition_type/parent_club_id/team_type, `0012` unicité des stats par compétition et
  `0013` textes des bandeaux, `0014` visibilité/pays du suivi international et `0015` zones par
  saison/phase).
  Le code est tolérant mais ces features restent inactives sinon.

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

> Rappel : ne pas modifier le socle pour l'instant. Ceci est une **liste de candidats** à valider
> une fois éprouvés par l'usage sur Belfoot.
