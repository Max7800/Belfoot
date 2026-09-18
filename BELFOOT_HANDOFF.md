# BELFOOT — Passation technique

> But de ce fichier : permettre à un autre modèle (ou dev) de **reprendre immédiatement** Belfoot
> à partir du repo, sans perte de contexte. À lire en entier avant de coder.
>
> Principe produit central : **image = décor / contenu = dynamique et administrable**.
> Le provider externe remplit la **donnée sportive** ; il ne doit **jamais** écraser les
> **choix éditoriaux/admin** (logos manuels, bannières, ordre, zones, textes, fonds de tuiles,
> relations de clubs, visibilité de blocs).
>
> **Audit obligatoire avant reprise :** lire aussi `BELFOOT_AUDIT.md`. L'audit du 18 septembre
> 2026 a identifié un P0 sécurité (RLS `profiles`, HTML riche, dépendances) qui passe désormais
> avant toute nouvelle fonctionnalité.
>
> Mise à jour : les rôles et le contenu riche sont durcis dans le code. Il faut encore appliquer
> `supabase/migrations/0002_profile_role_hardening.sql` sur Supabase. L'upgrade Next/Tiptap et les
> policies Storage restent les prochains lots sécurité.

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
  page.js                accueil Belfoot (hero + matchs + Belges + JPL + actus, blocs configurables)
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
  homeSections.js        textes, visibilité et ordre des blocs de l'accueil
  competitionHub.js      bandeau et textes administrables du portail Compétitions
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
             syncCompetition.js, syncSquads.js, syncEvents.js, syncLineups.js, discoverPlayers.js,
             trackPlayers.js, jobs/{sync,liveSync,squads,events,lineups,discoverBelgians,trackPlayers}.js,
             admin/, migrations/
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
jsonb — y vivent **labels/tiles/club_sections/home/competition_hub**), `categories`, `contributions`, `comments/votes/
reports` (interactions polymorphes target_type/target_id), `schema_migrations`, `audit_log`,
`job_runs`. RLS partout (lecture publique du publié, écriture admin via `is_admin()`).
Trigger `handle_new_user` : crée un `profiles` (role member) à chaque inscription.

**Football** (`modules/football/migrations/*`) :
- `competitions` : id, name, slug, provider ('apifootball'|'thesportsdb'), **external_id** (id ligue
  provider), logo_url, **banner_url** (décor), **zones** jsonb `[{label,color,from,to}]`, **position**
  (ordre, 0=premier), **rating_min** (seuil apparitions pour classement des notes),
  **competition_type** ('league'|'cup'), **public_visible** (permet de synchroniser une ligue
  étrangère sans l'afficher dans les sélecteurs publics), source/**locked**/synced_at/**ext** (jsonb : coverage,
  country, country_flag, providerName, season…). Depuis `0019`, le portail possède ses champs
  séparés : `portal_background_url`, `portal_border_color`, `portal_overlay`, `portal_title` et
  `portal_subtitle`, sans modifier le bandeau de la page détail.
- `clubs` : name, short_name, city, logo_url, **team_type** (first_team|reserve|u23|women),
  **parent_club_id** (réserves/U23), source/external_id/locked/synced_at/ext. Depuis `0016` :
  nickname, founded_year, description, website_url, couleurs, informations du stade et honours jsonb.
- `players` : name, club_id, position (Goalkeeper/Defender/Midfielder/Attacker), number,
  nationality, **country** (pays du championnat), competition, age, birth_date, photo_url, active,
  **tracked**, source/external_id/
  locked/synced_at/ext.
- `coaches` : name, club_id, photo_url, source/external_id/locked/synced_at/ext. Les saisies manuelles
  verrouillées sont prioritaires ; le job ciblé `football.coaches` alimente les autres.
- `seasons` : competition_id, label, **zones_by_phase** jsonb (`{ "Regular Season": [...] }`) pour
  isoler les règles de classement par saison et phase.
- `matches` : competition_id, season_id, home_club_id, away_club_id, home_score, away_score,
  status (scheduled|live|finished|postponed), minute, kickoff, source/external_id/locked/synced_at,
  **round_raw** (libellé provider brut), **phase** (ex. "Regular Season"), **round_number**,
  matchday (= round_number), provider, ext.
- `match_events` : match_id, minute, type (goal|assist|yellow|red|sub), player_id, club_id,
  **player_name/assist_name/detail** (dénormalisés, timeline lisible), source.
- `match_lineups` : formation officielle par match et club, avec source/verrou/synchro. Une correction
  admin verrouillée n'est jamais remplacée par le provider.
- `match_player_stats` : composition et performance individuelle par match : titulaire/remplaçant,
  numéro, poste/grille, capitaine, minutes, note, buts, passes, arrêts, buts encaissés et cartons.
  Le lien `player_id` peut rester vide si l'effectif n'a pas encore été importé ; le nom provider est
  conservé pour que la composition reste lisible.
- `player_season_stats` : player_id, competition_id, season, appearances, lineups, minutes, goals,
  assists, yellow, red, rating, source/external_id/synced_at,
  **unique(player_id,competition_id,season)** depuis la migration `0012`.
- Vues dérivées : `standings`, `top_scorers`, `top_assists` (⚠️ **phase-blind** : on privilégie le
  **calcul client** `lib/standings.computeStandings` scoppé par phase, cf. pièges).

`votw`, `forum` = schémas définis mais **modules désactivés**.

---

## 6. Migrations (fichiers présents)

Socle : `supabase/schema.sql` (= `supabase/migrations/0001_core.sql`).
Football : `modules/football/migrations/0001_init` → `0020_match_lineups` (init, players_tracking,
competition_slug, player_stats, players_events, events_names, rounds_phases, competition_position,
banner_zones, rating_min, types_relations, statistiques joueur séparées par compétition, textes
éditoriaux des bandeaux de compétition, visibilité publique des compétitions, pays du joueur,
zones de classement par saison/phase).
Autres : `modules/votw/migrations/0001_init`, `modules/forum/migrations/0001_init`.

⚠️ **Migrations passées à la main** dans Supabase. Le code est tolérant (tri client, fill-if-empty)
mais certaines fonctions restent inactives tant que la colonne n'existe pas. **Vérifier que TOUTES
les migrations football 0001→0019 sont passées** sur le projet (surtout position/banner/zones/
rating_min/competition_type/parent_club_id/team_type et `0012` avant toute nouvelle synchro des
effectifs/stats, puis `0013` pour éditer les titres de bandeau). Une colonne manquante n'affiche plus de page
blanche (résilience ajoutée) mais désactive la feature liée.

---

## 7. API-Football & sync

**Provider principal = API-Football (`v3.football.api-sports.io`)** via `modules/football/apifootball.js`
(header `x-apisports-key`). TheSportsDB = secondaire (contrat identique, `thesportsdb.js`).

**IDs provider utilisés** : Jupiler Pro League `external_id = 144`, Challenger Pro League
`external_id = 145`, Croky Cup `external_id = 147`, provider `apifootball`.
**Saison de dev = 2024** (le plan **gratuit** ne donne accès qu'aux saisons
**2022→2024** ; 2026 = plan payant). Le champ Saison des jobs accepte `2024` ou `2024-2025` (on
extrait l'année).

**Contrat provider** (`providers.js`) : un provider expose `{ key, fetchLeagueInfo, fetchClubs,
fetchMatches, fetchLiveMatches, fetchSquadPlayers, fetchPlayerSeason, fetchEvents }`. Chaque
compétition choisit son provider (colonne `provider`) → **aucune logique JPL en dur**, multi-sources.

**Orchestrateurs** : `syncCompetition` (mode full = clubs dérivés des matchs + enrichis + tous les
matchs + coverage + logo/nom/pays/drapeau si vide ; mode live = matchs en direct only),
`syncSquads` (effectifs + `player_season_stats` scoppées par compétition/saison en même temps,
0 requête en plus — met `tracked=true`),
`syncEvents` (événements par match, incrémental + plafonné 40/run), `syncLineups` (formations +
performances individuelles, incrémental, matchs récents d'abord et **3 matchs/run par défaut**),
`discoverBelgians`/`trackPlayers`
(suivi belges à l'étranger : discovery limitée aux clubs de la compétition demandée + tracking
ciblé `tracked=true`, tous deux scoppables avec `competitionId`).

**Jobs** (`lib/jobs.js`) : `football.sync`, `football.live-sync`, `football.squads`,
`football.events`, `football.lineups`, `football.discover-belgians`, `football.track-belgians`.
Chaque job accepte un
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
journées/tours + ancienne vue Liste) + `/matchs/[id]` (fiche premium, composition responsive,
formations, performances et timeline lisible). `/classement`
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
Événements, Formations, Compositions joueurs — via `EntityManager` + spec
`config/football-admin.js`) ; **Données & sync** (Providers,
Jobs [sélecteur compétition + saison + run], Historique sync, Erreurs) ; **Communauté** (Profils,
Signalements, Modération, Forum) ; **Réglages** (Configuration, Modules, Feature flags, Médias, SEO,
**Page d'accueil**, **Portail compétitions**, **Textes**, **Tuiles**, **Fiche club**, **Page Stats**).
Le panneau Portail compétitions édite son bandeau général, ses textes et son overlay ; les portes
individuelles restent dans Football → Compétitions. Le panneau Accueil édite
le hero, les appels à l'action, les titres/sous-titres, l'ordre et la visibilité des blocs sans
modifier le code. `EntityManager` : CRUD générique piloté par spec (types de
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
- **Clean sheets = gardien** : dès que `football.lineups` a traité les matchs, ils sont attribués au
  gardien réellement titulaire avec 0 but encaissé. Tant qu'aucune performance par match n'existe,
  le front garde l'ancien fallback (clean sheets du club attribués au GK n°1 par minutes).
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
- **Compositions & performances** = jusqu'à 2 requêtes/match (`/fixtures/lineups` et
  `/fixtures/players`). Le job est séparé, exige une compétition et reste plafonné à 3 matchs par défaut
  (20 maximum). Ne jamais le remettre dans `football.sync` ni le lancer sans filtre avec un gros plafond.
- **Bannière** ~2 Mo (`public/competition-banner.png`) : à compresser/WebP un jour.

---

## 14. TODO ouverts (par priorité indicative)

1. **P0 sécurité issu de `BELFOOT_AUDIT.md`** : verrouiller le rôle des profils, assainir le HTML
   riche/contributions, versionner les policies Storage, puis mettre Next/Tiptap à niveau dans des
   lots séparés. Ne pas ouvrir davantage les inscriptions/contributions avant ces correctifs.
2. **P1 fiabilité data** : automatiser le suivi des migrations, rattacher les matchs provider à
   `season_id`, séparer effectif et `tracked`, harmoniser `locked`, faire remonter les erreurs DB et
   verrouiller les jobs pour protéger le quota API.
3. **Tests/CI/observabilité** : tests RLS + provider + Playwright, CI avant `main`, error boundaries
   et monitoring. Le build seul ne détecte pas toutes les erreurs runtime.
4. **Valider le nouvel accueil sur données réelles** et ajuster les sélections éditoriales. Le hero,
   les matchs, les Belges suivis, la JPL et les actus sont construits ; le bloc Europe existe mais
   reste masqué par défaut. Aucun appel provider n'est effectué par l'accueil.
5. **Suivi des Belges à l'étranger** (cœur produit) : exercer `discover-belgians` + `track-belgians`,
   page annuaire V1 construite ; prochaine étape = ajouter les compétitions étrangères masquées,
   exercer les jobs, puis construire le top/récap des Belges du week-end.
6. **Éditorial** : structurer Mercato (Vérifié/Rumeur/Démenti), En bref, analyses et scouting ;
   l'accueil consomme déjà automatiquement les actualités publiées.
7. **Récap des Belges du week-end** : exploiter `match_player_stats` maintenant disponible pour
   construire une sélection datée (buts, passes, notes, minutes), avec seuils/sélection éditables.
8. **Europe belge** : ajouter C1/C3/C4 comme compétitions synchronisées, mettre en avant tout match
   impliquant un club belge et créer un bloc/page coefficient UEFA (association + clubs). Prévoir
   une source coefficient vérifiable et une surcharge admin avant automatisation complète.
9. **Challenger Pro League / réserves** : migration `0018` prête (compétition 145 + saison
   2024-2025). Après application, lancer `football.sync` puis `football.squads` uniquement sur la
   Challenger. Club NXT, Jong Genk, RSCA Futures et Jong KAA Gent sont reliés automatiquement à
   leur parent sans perdre leurs propres matchs, classement et fiche ; vérifier ensuite les liens.
10. **Passer en plan payant** API-Football pour la saison courante (le code est prêt : changer `season`).
11. Régler les Zones JPL par saison/phase. Pour la Croky, renseigner idéalement Type = `cup` en admin ; le front est
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
#    supabase/schema.sql (socle), puis modules/football/migrations/0001_init → 0020.
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
compositions = `components/football/MatchLineups.js` + `modules/football/syncLineups.js` ;
admin générique = `components/admin/EntityManager.js` + `config/football-admin.js` ;
panneaux admin = `components/admin/panels.js` + `registry.js` ; page compétition (la plus riche) =
`app/competitions/[slug]/page.js` ; détection ligue/coupe = `lib/competitionType.js` ; vue tours de
coupe = `components/football/CupRounds.js` ; URL/résolution rétrocompatible des compétitions =
`lib/competitionRoutes.js`.

---

## CHANGELOG_DE_PASSATION

### 2026-09-17 — ChatGPT — compositions et performances individuelles par match

- Migration `0020_match_lineups.sql` : nouvelles tables publiques/admin `match_lineups` et
  `match_player_stats`, avec relations match/compétition/club/joueur, champs provider isolés,
  verrouillage manuel, index et RLS.
- API-Football expose maintenant les formations/titulaires/remplaçants via `/fixtures/lineups` et
  les minutes, notes, buts, passes, arrêts, buts encaissés et cartons via `/fixtures/players`.
- Nouveau job indépendant `football.lineups` : compétition obligatoire,
  matchs terminés/récents d'abord, import incrémental, 3 matchs par run par défaut et 20 maximum.
  Le plafond est éditable dans Admin → Jobs. Aucun appel n'est effectué depuis une page publique.
- La fiche match affiche les deux compositions côte à côte sur desktop et via un poussoir domicile/
  extérieur sur mobile, avec formation, banc et performances. Les intitulés passent par les Textes.
- La page compétition calcule désormais les clean sheets avec le gardien réellement titulaire dès
  que les performances existent, sinon elle garde le fallback historique. La fiche joueur affiche
  ses dernières performances et renvoie vers les matchs.
- Admin → Football permet de corriger/verrouiller formations et joueurs d'une composition.
- `0018_challenger_pro_league.sql` est rendu compatible avec une ancienne ligne possédant déjà
  `external_id=145` et ajoute son propre garde-fou `public_visible`.
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices + `git diff --check`.
  Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — personnalisation complète du portail et des Leaders

- Migration `0019_competition_portal_style.sql` : chaque compétition peut avoir un fond, un contour,
  un overlay, un titre et un texte spécifiques à sa porte du portail, indépendamment du bandeau et
  des textes de sa page détail. Vide = fallback automatique sur le bandeau existant.
- Admin → Football → Compétitions expose clairement les deux ensembles de champs. Cela permet par
  exemple d'avoir un bandeau Croky sur la page détail et une composition différente sur sa porte.
- Nouveau panneau Admin → Réglages → Portail compétitions : sur-titre, titre, introduction, image
  générale et assombrissement du bandeau de `/competitions`.
- Admin → Réglages → Tuiles sépare maintenant « Reflet / accent » et « Contour ». Le contour choisi
  reste appliqué même lorsqu'une image de fond est présente ; il n'est plus forcé en blanc.
- Aucune consommation API supplémentaire. Les anciennes configurations restent valides grâce aux
  fallbacks.

### 2026-09-17 — ChatGPT — préparation Challenger Pro League

- Migration `0018_challenger_pro_league.sql` : crée ou complète sans doublon la Challenger Pro
  League (`apifootball`, ID 145), visible dans le portail, position 10, format championnat, texte
  éditorial modifiable et saison `2024-2025` exploitable avec le quota gratuit.
- Aucune zone de classement n'est préremplie : le format et les couleurs restent à valider puis à
  saisir dans `seasons.zones_by_phase`, comme pour la JPL.
- Après chaque synchronisation complète, Club NXT, Jong Genk, RSCA Futures et Jong KAA Gent sont
  reliés au club parent connu et typés U23 si ces champs sont encore vides/génériques. Un club
  verrouillé ou une relation déjà saisie n'est jamais écrasé.
- Ordre après migration : lancer `football.sync` saison `2024`, compétition Challenger seulement,
  puis `football.squads` quand le quota le permet. Aucun appel API n'est ajouté au chargement public.

### 2026-09-17 — ChatGPT — portail Compétitions Belfoot

- `/competitions` n'est plus une simple grille de petites tuiles utilitaires : nouveau bandeau
  éditorial Belfoot et grandes « portes » visuelles utilisant logo, bannière et textes déjà
  administrables de chaque compétition.
- Les cartes différencient championnat et coupe et proposent des accès directs vers Vue d'ensemble,
  Matchs, Classement/Tours et Clubs. Elles ne recopient volontairement ni résultats, ni classement,
  ni statistiques : le portail oriente vers ces contenus sans faire doublon.
- Le titre, l'introduction et les textes génériques du portail passent par `useLabels`
  (`competitions.kicker`, `competitions.title`, `competitions.intro`, etc.).
- Aucune migration et aucun appel provider supplémentaire. Les futures compétitions publiques
  héritent automatiquement du même rendu.

### 2026-09-17 — ChatGPT — accueil Belfoot et fiche club mobile compacte

- La fiche club propose maintenant un retour contextualisé vers l'onglet Clubs de sa compétition.
- Sur mobile, la longue pile d'accordéons est remplacée par des pastilles horizontales et une seule
  rubrique visible à la fois. Le rendu desktop en accordéons reste inchangé ; le hero mobile est
  aussi légèrement compacté.
- L'ancien accueil placeholder est remplacé par une vraie home Belfoot fidèle à la maquette produit
  historique : hero « Les Belges. Partout dans le monde. » avec compteurs, grand bloc JPL en trois
  colonnes, Belges à suivre, En forme + Belge du moment, tour des championnats, actualités et En bref.
- Tous ces contenus réutilisent uniquement Supabase ; la page ne déclenche aucun appel API-Football.
  Les états vides restent présentables quand le quota empêche encore d'alimenter une donnée.
- Admin → Réglages → Page d'accueil permet d'éditer tous les textes du hero et des boutons, son grand
  visuel, ainsi que titre, sous-titre, lien, visibilité et ordre de chaque bloc. Le bloc Europe est
  prêt mais masqué par défaut.
- Nouvelle migration : **aucune** (`site_settings.data.home` est un jsonb existant).
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices + `git diff --check`.
  Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — stades automatisés et clarification Club NXT/D2

- Le panneau Réserves/U23 préparé localement a été retiré avant push : `team_type` et
  `parent_club_id` étaient déjà éditables dans Football → Clubs.
- Une équipe liée reste une entité sportive autonome. Exemple : Club NXT peut garder Club Brugge
  comme parent **et** jouer en Challenger Pro League ; ce sont les matchs/`competition_id` qui
  déterminent sa compétition, son classement et ses statistiques. Le vrai chantier est donc
  l'import D2, pas une deuxième interface de relation parent.
- L'import clubs récupère maintenant automatiquement, sans requête supplémentaire, l'année de
  fondation et les données de stade déjà renvoyées par API-Football/TheSportsDB : nom, capacité,
  adresse et image.
- Ces informations remplissent seulement les champs vides et ne remplacent jamais un club verrouillé
  ni une correction éditoriale. Elles nécessitent la migration `0016_club_profiles.sql`.
- Le classement d'une fiche club reste déjà automatique à partir des matchs de sa compétition/saison.
- Palmarès : pas de source équipe fiable dans le provider actuel ; conserver l'éditeur manuel en
  attendant un import historique contrôlé. Europe/coefficient UEFA ajoutés à la roadmap.
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices + `git diff --check`.
  Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — synchronisation protégée des entraîneurs

- Contrat provider étendu avec `fetchCurrentCoach`. API-Football interroge `/coachs?team=...` et
  privilégie la carrière courante (pas de date de fin) pour le club demandé.
- Nouveau synchroniseur `syncCoaches` et job `football.coaches`, exposé dans Admin → Jobs sous
  « Entraîneurs ». Il reste séparé de l'import complet : environ une requête API par club, avec
  sélection d'une compétition fortement recommandée pour le quota gratuit.
- Les entraîneurs verrouillés sont détectés **avant** l'appel provider et ne consomment donc aucune
  requête. Les anciens coachs provider ne sont pas supprimés : ils sont simplement détachés du club.
- Admin → Football → Entraîneurs expose la case « Protéger des synchronisations ». Sur la fiche club,
  un coach verrouillé ou manuel reste prioritaire s'il coexiste avec une ligne provider.
- Migration `0017_protect_manual_coaches.sql` : verrouille les entraîneurs déjà saisis manuellement.
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices + `git diff --check`.
  Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — Stats administrables, fiches clubs complètes et zones explicites

- `/matchs` garde les deux modes mais s'ouvre désormais sur **Liste** ; le bouton Liste passe aussi
  avant Calendrier, conformément à la priorité produit.
- L'éditeur des zones montre « Du rang » / « Au rang », un résumé immédiat (« rangs 5 à 16 » ou
  « uniquement le rang 16 »), la validation des bornes et un raccourci « Seulement le rang N ».
  Le cas observé venait d'une plage 5→16 restée enregistrée : changer seulement sa couleur colorait
  logiquement les douze rangs.
- Page Stats refondue : bandeau contextualisé saison/phase, KPI plus lisibles et classements joueurs
  en cartes premium. Nouveau panneau Admin → Réglages → Page Stats, **par compétition**, pour éditer
  titre, sous-titre, noms, accents, visibilité et ordre des sept blocs. Les données restent calculées.
- Fiches clubs enrichies : hero aux couleurs du club, Identité, Classement du club, Statistiques,
  Stade et Palmarès, en plus de l'effectif, équipes liées et matchs. Le classement/stats sont calculés
  sur le couple compétition/saison le plus représenté, afin qu'un seul match de coupe ne remplace pas
  le championnat.
- Admin → Football → Clubs expose tous les contenus éditoriaux ; Admin → Réglages → Fiche club permet
  aussi d'éditer le nom, l'ordre et la visibilité de chaque section.
- Migration `0016_club_profiles.sql` : surnom, fondation, présentation, site, couleurs, informations
  du stade et palmarès jsonb. À appliquer avant d'enregistrer ces champs dans l'admin.
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices de compilation +
  `git diff --check` réussi. Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — vraie vue calendrier

- `/matchs` propose une vue Calendrier, avec une bascule vers la vue Liste historique (la Liste est
  redevenue la vue par défaut dans le lot suivant).
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

### 2026-09-17 — ChatGPT — hiérarchie visuelle du portail Compétitions

- La première compétition selon l'ordre administrable `position` devient la porte principale du
  portail et occupe toute la largeur sur desktop ; les suivantes restent en grille de deux. Aucune
  compétition ni aucun nom n'est codé en dur : changer l'ordre dans l'admin change aussi la mise en
  avant.
- Bandeau global compacté pour laisser davantage de place aux portes, sans retirer ses textes,
  son image ou son overlay administrables.
- Cartes rééquilibrées : logo principal agrandi, accent du badge et halo dérivés de la couleur de
  contour administrable, filet supérieur coloré, contraste du sous-titre renforcé et navigation
  basse plus légère avec effet de verre.
- Le mobile conserve une pile uniforme : la carte principale ne devient large et plus éditoriale
  qu'à partir du breakpoint desktop.
- Nouvelle migration : **aucune**. Vérification : build Next.js 14.2.35 réussi avec variables
  Supabase factices de compilation + `git diff --check` réussi. Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — Belges à l'étranger V2 administrable

- La base existante de `/belges-a-l-etranger` est conservée : bandeau, compteurs, filtres et cartes
  joueurs. La page devient un vrai hub avec cinq modules ordonnables : prochains matchs, forme,
  championnats, dernières performances et annuaire complet.
- Les cartes de championnat servent de filtre et amènent directement à l'annuaire. Les prochains
  matchs sont détectés via les clubs des joueurs suivis, sans requête API depuis le public.
- Le bloc Forme utilise en priorité les cinq dernières lignes `match_player_stats` et retombe sur
  les statistiques de saison tant que les performances par match ne sont pas alimentées. Le récap
  reste dans un état d'attente propre si la migration `0020` n'est pas encore passée.
- Nouveau panneau Admin → Réglages → Belges à l'étranger : textes et image du bandeau, overlay,
  joueur mis en avant manuellement ou automatiquement, visibilité/ordre/textes/couleur de chaque
  module. Stockage dans `site_settings.data.belgians_abroad`, donc aucune migration supplémentaire.
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices de compilation +
  `git diff --check` réussi. Socle : **aucune modification**.

### 2026-09-17 — ChatGPT — import ciblé d'une équipe étrangère (test Burnley)

- Nouveau job `football.team-test` : exige une compétition et un ID équipe API-Football, puis
  importe uniquement le profil du club, ses matchs dans la compétition choisie, les adversaires
  nécessaires à l'affichage et les joueurs belges du club avec leurs statistiques de saison.
- Le provider API-Football expose désormais `fetchClubById` et `fetchTeamMatches`. Le filtre sur
  l'ID de ligue empêche d'importer les matchs de coupe ou d'une autre compétition du même club.
- Admin → Jobs reçoit un champ « ID équipe API » (Burnley `44` par défaut) et le bouton
  « Importer l'équipe test ». Le job reste générique pour tester ensuite n'importe quel club.
- Migration `0021_burnley_test.sql` : ajoute/normalise l'EFL Championship (`external_id=40`) comme
  compétition étrangère masquée, saison `2024-2025`. Elle n'apparaît donc pas dans le portail des
  compétitions mais alimente la page Belges à l'étranger.
- Sur la page Belges, le module Annuaire retrouve la première position sous le bandeau par défaut,
  afin de préserver la base initiale et ses listes déroulantes sur desktop comme sur mobile.
- Correction après validation visuelle : l'annuaire n'est plus présenté comme un module titré et
  ordonnable. Sa barre de recherche, ses listes déroulantes et ses cartes sont épinglées directement
  sous le bandeau, exactement comme dans la base initiale ; les nouveaux modules commencent après.
- Deuxième correction après test mobile avec base vide : les filtres restent désormais visibles
  même lorsqu'aucun joueur étranger n'est encore importé. L'état « suivi international prêt » se
  place sous les listes au lieu de remplacer l'annuaire ; Burnley remplira ensuite cette grille.
- Coût estimé du test : une requête ligue, une équipe, une liste de matchs et la pagination de
  l'effectif ; aucun import des autres effectifs du Championship.
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices de compilation +
  `git diff --check` réussi. Socle : **aucune modification**.

### 2026-09-18 — ChatGPT — navigation et page Matchs réellement responsives

- La navigation globale n'est plus une longue rangée horizontale coupée sur mobile/tablette : logo,
  recherche et bouton menu restent visibles, puis le menu s'ouvre en grille avec navigation,
  connexion/compte, admin et thème. La barre desktop est conservée à partir de `lg`.
- `/matchs` démarre automatiquement en vue Calendrier sur mobile, tout en gardant Liste par défaut
  sur desktop. L'ordre visuel du poussoir suit aussi le support : Calendrier d'abord sur mobile,
  Liste d'abord sur desktop. Le choix manuel de l'utilisateur reste prioritaire.
- Les compétitions deviennent un rail horizontal sans scrollbar sur mobile. Les phases passent dans
  une liste déroulante ; en vue Liste, les 30 boutons de journées sont remplacés par un seul
  sélecteur. Les puces complètes restent inchangées sur desktop.
- Le rail des journées du calendrier reste balayable au doigt mais sa scrollbar native est masquée.
- Nouvelle migration : **aucune**. Vérification : build Next.js 14.2.35 réussi avec variables
  Supabase factices de compilation + `git diff --check` réussi. Socle : **aucune modification**.

### 2026-09-18 — ChatGPT — plafond de pagination API-Football Free

- Le premier import ciblé Burnley a atteint l'effectif puis échoué avec `Free plans are limited to
  a maximum value of 3 for the Page parameter` : `fetchSquadPlayers` autorisait encore 15 pages.
- Toutes les récupérations d'effectifs API-Football sont désormais plafonnées à 3 pages, avec un
  `playerPageCap` optionnel qui ne peut jamais dépasser cette limite. Relancer le job est sans
  danger : clubs et matchs utilisent des upserts et ne seront pas dupliqués.
- Nouvelle migration : **aucune**. Le test Burnley doit être relancé après déploiement du correctif.

### 2026-09-18 — ChatGPT — calendrier dans la fiche compétition + réparation `players.country`

- La première passe responsive avait corrigé `/matchs`, mais la capture utilisateur concernait
  `/competitions/[slug]?tab=matchs`. Cet onglet dispose maintenant lui aussi de Calendrier/Liste :
  Calendrier est placé en premier et sélectionné par défaut sur mobile, Liste reste première sur
  desktop, et les journées deviennent un select sur mobile en mode Liste.
- Les phases sont compactées dans un select mobile. Les onglets Vue d'ensemble/Matchs/Classement/
  Clubs/Joueurs/Stats restent sur un rail horizontal balayable au lieu de former trois lignes ; le
  sélecteur de saison passe sous ce rail sur mobile. Le poussoir de compétitions masque également sa
  scrollbar native.
- Le second test Burnley a révélé `Could not find the 'country' column of 'players' in the schema
  cache` : la migration `0014` n'était pas entièrement appliquée sur la base réelle.
- Migration de réparation `0022_ensure_player_country.sql` : ajoute la colonne et l'index de suivi
  s'ils manquent, puis exécute `notify pgrst, 'reload schema'`. Après application, attendre quelques
  secondes puis relancer l'import Burnley.
- Vérification : build Next.js 14.2.35 réussi avec variables Supabase factices de compilation +
  `git diff --check` réussi. Socle : **aucune modification**.

### 2026-09-18 — ChatGPT — consolidation du parcours Belges / fiche joueur

- Le test Burnley ayant validé l'import ciblé, la fiche `/players/[id]` devient une vraie page de
  suivi : retour vers l'annuaire des Belges, identité/club/pays/poste, quatre chiffres de saison,
  minutes et moyenne, trois prochains matchs du club, performances match par match et tableau par
  compétition. Le rendu est en cartes sur mobile et en deux colonnes sur grand écran.
- Les performances ne sont plus ordonnées par leur date de synchronisation : elles sont reliées aux
  matchs puis triées par `matches.kickoff`. La fiche récupère aussi les anciens matchs nécessaires
  si une performance n'appartient plus aux 100 matchs récents du club.
- Aucun appel API n'est fait depuis une page publique. Pour enrichir Burnley sans brûler le quota :
  choisir le Championship dans Jobs, mettre `Max matchs` à 1–3, puis lancer **Compositions &
  performances**. L'aide du panneau admin explique désormais cette séquence.
- Correction de fiabilité : une fiche joueur `locked` conserve bien ses champs éditoriaux, mais
  l'import équipe ciblée continue de mettre à jour sa ligne `player_season_stats` séparée. Avant,
  le `continue` sautait également les statistiques.
- L'annuaire demande les performances les plus récemment synchronisées en premier. L'admin accepte
  maintenant les postes longs renvoyés par API-Football (`Goalkeeper`, `Defender`, `Midfielder`,
  `Attacker`) en plus des abréviations.
- Nouvelle migration : **aucune**. Vérification : build Next.js 14.2.35 réussi avec variables
  Supabase factices de compilation + `git diff --check` réussi. Socle : **aucune modification**.

### 2026-09-18 — ChatGPT — correctif runtime fiches joueur et match

- Après déploiement de la nouvelle fiche joueur, le navigateur affichait `Application error` :
  `useLabels()` renvoie directement la fonction `L`, mais les fiches joueur et match tentaient de la
  déstructurer avec `{ L }`. La compilation ne détectait pas cette erreur JavaScript côté client.
- Les deux pages utilisent maintenant `const L = useLabels()`. Cela répare la fiche ouverte depuis
  `/belges-a-l-etranger` et évite la même erreur latente dès qu'une composition serait visible sur
  `/matchs/[id]`.
- Nouvelle migration : **aucune**. Vérification : build Next.js 14.2.35 + `git diff --check`.

### 2026-09-18 — ChatGPT — audit complet de passation

- Nouveau document racine `BELFOOT_AUDIT.md` : audit sécurité, RLS, dépendances, Storage,
  contributions, migrations, providers/quota, modèle saison, performance Supabase, tests/CI,
  observabilité, responsive admin, accessibilité, SEO et roadmap priorisée.
- P0 identifié avant toute nouvelle feature : empêcher un membre de modifier `profiles.role`,
  assainir le HTML éditorial/contributions, versionner les policies Storage et mettre à niveau
  Next/Tiptap dans des lots testables séparément.
- `npm audit --package-lock-only` : 27 vulnérabilités rapportées (`1 critical`, `1 high`,
  `25 moderate`). Aucun PAT GitHub ou secret serveur trouvé dans les fichiers/l'historique inspecté ;
  le remote Git ne contient pas de credential.
- Risques data prioritaires documentés : imports sans `season_id`, `syncSquads` qui met tous les
  joueurs en `tracked`, erreurs d'upsert parfois ignorées, pas de lock/budget de job, migrations
  manuelles non suivies et requêtes publiques qui atteindront le plafond de 1 000 lignes.
- Ce lot est volontairement **documentation seulement** : aucun correctif sensible n'a été mêlé à
  l'audit sans validation de l'utilisateur.

### 2026-09-18 — ChatGPT — durcissement rôles et contenu éditorial

- Nouvelle migration core `0002_profile_role_hardening.sql` : suppression de l'insertion directe
  de profil, UPDATE client limité à `username`, promotion/rétrogradation via RPC admin auditée et
  protection du dernier administrateur. Le panneau Profils utilise cette RPC et affiche les erreurs.
- Le HTML riche est assaini côté serveur au rendu avec `sanitize-html` et une allowlist compatible
  avec l'éditeur (pas de scripts, handlers, styles, iframe ni URL `javascript:`).
- Nouvelle route admin `/api/admin/contributions/review` : JWT + rôle revérifiés, contribution relue
  en base, collection/type/cible/payload validés, richtext assaini et décision journalisée.
- La file de modération expose tous les champs en texte échappé. Une création acceptée devient un
  brouillon ; une correction conserve l'état de publication existant après relecture explicite.
- Vérifications : payload hostile nettoyé, build Next.js de production et `git diff --check` réussis.

---

## CURRENT_GIT_STATE

- **Branche** : `main`
- **Dernier commit distant avant le lot courant** : `b503c15` — correctif runtime des fiches joueur
  et match. Le commit local `a632647` ajoute l'audit ; le lot suivant durcit SEC-01/SEC-03.
- **Commits importants récents** :
  - `2c71e35` documentation clubs liés / Europe
  - `69578a5` automatisation des stades + simplification des équipes liées
  - `251c4ab` documentation de la synchronisation des entraîneurs
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
- **Migrations encore à passer** (si le projet Supabase n'est pas à jour) : appliquer d'abord
  `supabase/migrations/0002_profile_role_hardening.sql`. Pour le football, `0012` est indiquée comme
  appliquée par l'utilisateur ; vérifier `0013_competition_header_texts.sql`, puis appliquer
  `0014_belgians_abroad.sql`, `0015_season_phase_zones.sql`, `0016_club_profiles.sql`, puis
  `0017_protect_manual_coaches.sql`, `0018_challenger_pro_league.sql`, puis
  `0019_competition_portal_style.sql`, `0020_match_lineups.sql`, `0021_burnley_test.sql`, puis
  `0022_ensure_player_country.sql`, et vérifier que `modules/football/migrations/0001→0022` sont
  **toutes** passées (surtout `0008` position, `0009` banner_url/zones, `0010` rating_min,
  `0011` competition_type/parent_club_id/team_type, `0012` unicité des stats par compétition et
  `0013` textes des bandeaux, `0014` visibilité/pays du suivi international, `0015` zones par
  saison/phase, `0016` contenu éditorial des fiches clubs, `0017` protection des coachs manuels et
  `0018` création Challenger Pro League et `0019` style séparé des portes du portail).
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
