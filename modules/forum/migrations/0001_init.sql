-- FORUM (module optionnel). Profils communs = table `profiles` du socle.
create table if not exists forum_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique, position int default 0, created_at timestamptz default now()
);
create table if not exists forum_topics (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references forum_categories(id) on delete cascade,
  author uuid references auth.users(id) on delete set null,
  title text not null, slug text, pinned boolean default false, locked boolean default false,
  last_activity timestamptz default now(), created_at timestamptz default now()
);
create table if not exists forum_posts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references forum_topics(id) on delete cascade,
  author uuid references auth.users(id) on delete set null,
  body text not null, created_at timestamptz default now(), deleted_at timestamptz
);
create index if not exists forum_topics_cat on forum_topics (category_id, pinned desc, last_activity desc);
alter table forum_categories enable row level security;
alter table forum_topics     enable row level security;
alter table forum_posts      enable row level security;
create policy "fcat_read"  on forum_categories for select using (true);
create policy "fcat_write" on forum_categories for all using (is_admin()) with check (is_admin());
create policy "ftop_read"  on forum_topics for select using (true);
create policy "ftop_write" on forum_topics for insert with check (author = auth.uid());
create policy "ftop_mod"   on forum_topics for update using (is_admin() or author = auth.uid());
create policy "fcat_del"   on forum_topics for delete using (is_admin());
create policy "fpost_read"  on forum_posts for select using (deleted_at is null or is_admin());
create policy "fpost_write" on forum_posts for insert with check (author = auth.uid());
create policy "fpost_mod"   on forum_posts for update using (is_admin() or author = auth.uid());

-- Nom d'auteur dénormalisé (affichage sans exposer la table profiles, lecture self-only).
alter table forum_topics add column if not exists author_name text;
alter table forum_posts  add column if not exists author_name text;

insert into public.schema_migrations (module, version)
values ('forum', '0001_init') on conflict do nothing;
