# Socle — moteur de sites réutilisable

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
3. Passer `supabase/schema.sql` puis les `modules/*/schema.sql` voulus.
4. `npm run dev`
