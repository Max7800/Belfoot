# Belfoot

Fork football belge du socle réutilisable. Pour reprendre le projet, lire dans cet ordre :

1. `BELFOOT_HANDOFF.md` — architecture, décisions produit, historique et procédures ;
2. `BELFOOT_AUDIT.md` — audit sécurité/qualité du 18 septembre 2026 et roadmap priorisée.

**Important :** le durcissement des rôles et du contenu riche est codé, mais la migration
`supabase/migrations/0002_profile_role_hardening.sql` doit être appliquée en production. L'upgrade
Next/Tiptap reste le prochain lot P0 avant toute nouvelle fonctionnalité.

## Origine du projet

Synthèse propre de VCH + Flo Potez, sans leur dette. Fork ce repo pour un
nouveau site : tu ne touches en principe qu'à `/config`.

## Architecture
- **Socle générique** : identité, thème (tokens clair/sombre), auth/rôles,
  admin autonome, SEO, médias, et un **moteur de collections déclaratives**
  (contenus éditoriaux) sur une table polymorphe unique `entries`.
- **Modules métier optionnels** (`/modules/*`) : leurs **propres tables**,
  branchés au reste via un **contrat de module commun** (manifest + admin +
  routes + nav + schema). Ex. `football`, `votw`.

## Ajouter…
- **un type de contenu simple** → une entrée dans `config/collections.js`
  (admin CRUD + pages liste/détail générés automatiquement).
- **un besoin métier complexe** → un dossier `modules/<nom>/` avec son
  manifest, son `schema.sql` et ses composants d'admin.
- **activer/désactiver** un module → `config/modules.js`.

## Mise en route
1. `npm install`
2. Copier `.env.local.example` → `.env.local` (clés Supabase).
3. Passer `supabase/schema.sql`, puis `supabase/migrations/0002_profile_role_hardening.sql`, puis les migrations football dans l'ordre
   `modules/football/migrations/0001_init.sql` → `0022_ensure_player_country.sql`.
4. `npm run dev`

Les migrations sont encore appliquées manuellement. L'audit demande de remplacer ce fonctionnement
par un suivi automatisé avant d'étendre les données.
