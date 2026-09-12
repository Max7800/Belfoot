-- =============================================================================
--  SCHÉMA DU SOCLE — générique et réutilisable tel quel par chaque fork.
--
--  Idée clé : UNE seule table de contenu (`entries`) pour TOUTES les
--  collections. Le champ `collection` distingue actus / fiches / joueurs…
--  Ajouter un type de contenu ne demande donc AUCUNE migration.
-- =============================================================================

-- ── Rôles / profils ──────────────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text unique,
  role        text not null default 'member',   -- 'member' | 'admin'
  created_at  timestamptz default now()
);

-- Helper : l'utilisateur courant est-il admin ?
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ── Contenu générique ────────────────────────────────────────────────────────
create table if not exists entries (
  id            uuid primary key default gen_random_uuid(),
  collection    text not null,                 -- ex. 'news', 'entries_demo'
  title         text,
  slug          text,
  excerpt       text,
  body          text,
  cover_url     text,
  images        jsonb   not null default '[]', -- galerie
  category      text,
  tags          jsonb   not null default '[]',
  data          jsonb   not null default '{}', -- champs spécifiques additionnels
  seo           jsonb   not null default '{}', -- { title, description }
  position      int     not null default 0,    -- tri manuel (collections ordered)
  published     boolean not null default false,
  published_at  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  deleted_at    timestamptz,                 -- soft delete
  unique (collection, slug)
);

create index if not exists entries_lookup
  on entries (collection, published, position);

-- ── Réglages du site (thème, catégories gérables, etc.) ──────────────────────
create table if not exists site_settings (
  id            int primary key default 1,
  categories    jsonb not null default '{}',   -- catégories par collection
  data          jsonb not null default '{}',
  updated_at    timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into site_settings (id) values (1) on conflict do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table profiles      enable row level security;
alter table entries       enable row level security;
alter table site_settings enable row level security;

-- Profils : chacun lit/écrit le sien ; les admins voient tout.
create policy "profiles_self_read"  on profiles for select using (auth.uid() = id or is_admin());
create policy "profiles_self_write" on profiles for update using (auth.uid() = id);
create policy "profiles_insert"     on profiles for insert with check (auth.uid() = id);

-- Contenu : lecture publique de ce qui est publié ; écriture réservée admin.
create policy "entries_public_read" on entries for select using ((published = true and deleted_at is null) or is_admin());
create policy "entries_admin_write" on entries for all    using (is_admin()) with check (is_admin());

-- Réglages : lecture publique, écriture admin.
create policy "settings_read"  on site_settings for select using (true);
create policy "settings_write" on site_settings for all    using (is_admin()) with check (is_admin());

-- =============================================================================
--  CAPACITÉS DU MOTEUR (couche 2) — primitives transverses réutilisables.
-- =============================================================================

-- ── Catégories / pastilles colorées ──────────────────────────────────────────
-- `scope` = groupe de catégories (souvent la clé d'une collection, ou 'shared').
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  name text not null,
  color text not null default '#64748b',
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists categories_scope on categories (scope, position);
alter table categories enable row level security;
create policy "categories_read"  on categories for select using (true);
create policy "categories_write" on categories for all using (is_admin()) with check (is_admin());

-- ── Contributions / modération ───────────────────────────────────────────────
-- Un membre PROPOSE un contenu (create) ou une correction (edit). L'admin
-- modère la file ; à l'acceptation, le payload est appliqué dans `entries`.
create table if not exists contributions (
  id uuid primary key default gen_random_uuid(),
  collection text not null,
  target_id uuid,                         -- null = nouveau ; sinon = correction d'une entry
  kind text not null default 'create',    -- 'create' | 'edit'
  payload jsonb not null default '{}',     -- champs proposés (clés = champs de la collection)
  status text not null default 'pending',  -- pending | approved | rejected
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  note text                               -- motif de refus éventuel
);
create index if not exists contributions_status on contributions (status, submitted_at);
alter table contributions enable row level security;
-- Le membre voit/propose les siennes ; l'admin voit et modère tout.
create policy "contrib_read"   on contributions for select using (submitted_by = auth.uid() or is_admin());
create policy "contrib_insert" on contributions for insert with check (submitted_by = auth.uid());
create policy "contrib_review" on contributions for update using (is_admin()) with check (is_admin());

-- =============================================================================
--  RECHERCHE — index plein-texte sur `entries` (v1). Les modules ajoutent leurs
--  propres fournisseurs de recherche côté app (contrat lib/search.js).
-- =============================================================================
-- Chaque contenu porte sa locale (fr/nl/en) pour un filtrage/affinage futur.
alter table entries add column if not exists locale text;

-- Index plein-texte NEUTRE ('simple' : tokenisation sans stemming lié à une
-- langue) -> la recherche n'est PAS figée sur le français. Le stemming par
-- langue (french/dutch/english) pourra etre branche plus tard via un trigger
-- choisissant la config selon `locale`, sans refonte de l'UI ni du contrat.
alter table entries drop column if exists search;
alter table entries add column search tsvector
  generated always as (
    to_tsvector('simple',
      coalesce(title,'') || ' ' || coalesce(excerpt,'') || ' ' ||
      coalesce(category,'') || ' ' || coalesce(body,''))
  ) stored;
create index if not exists entries_search on entries using gin (search);


-- =============================================================================
--  INFRASTRUCTURE SOCLE — migrations versionnées, audit, jobs.
-- =============================================================================

-- Suivi des migrations appliquées, PAR MODULE (le socle = module 'core').
create table if not exists schema_migrations (
  module text not null,
  version text not null,          -- ex. '0001_init'
  applied_at timestamptz default now(),
  primary key (module, version)
);

-- Journal d'audit minimal (qui a fait quoi).
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users(id) on delete set null,
  action text not null,           -- ex. 'contribution.approve'
  target_table text,
  target_id uuid,
  meta jsonb not null default '{}',
  created_at timestamptz default now()
);
alter table audit_log enable row level security;
create policy "audit_read"   on audit_log for select using (is_admin());
create policy "audit_insert" on audit_log for insert with check (auth.uid() is not null);

-- Traces d'exécution des background jobs (voir contrat lib/jobs.js).
create table if not exists job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  status text not null default 'running',  -- running | ok | error
  detail text,
  started_at timestamptz default now(),
  finished_at timestamptz
);
alter table job_runs enable row level security;
create policy "job_runs_read" on job_runs for select using (is_admin());
