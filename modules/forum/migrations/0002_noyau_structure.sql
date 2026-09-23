-- 0002_noyau_structure.sql — « Le Noyau » : structure + finition du forum.
-- Idempotent, rejouable.
begin;

-- Description des catégories.
alter table forum_categories add column if not exists description text;

-- Liaison future (Match Center / club / joueur / article) — PRÉPARÉ, non branché.
alter table forum_topics add column if not exists ref_type text;   -- 'match' | 'club' | 'player' | 'article'
alter table forum_topics add column if not exists ref_id uuid;

-- Sécurité SEC-06 : épingler / verrouiller / éditer un sujet = admin uniquement
-- (l'ancienne policy laissait l'auteur modifier pinned/locked de son propre sujet).
drop policy if exists "ftop_mod" on forum_topics;
create policy "ftop_admin_update" on forum_topics for update using (is_admin());

-- last_activity remonte quand on répond (trigger SECURITY DEFINER -> bypass RLS,
-- car un répondant non-auteur ne peut pas écrire dans forum_topics).
create or replace function forum_bump_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update forum_topics set last_activity = now() where id = NEW.topic_id;
  return NEW;
end $$;
drop trigger if exists forum_posts_bump on forum_posts;
create trigger forum_posts_bump after insert on forum_posts
  for each row execute function forum_bump_activity();

-- Semences : 4 catégories initiales (idempotent via slug unique).
insert into forum_categories (name, slug, description, position) values
  ('Football belge', 'football-belge', 'Pro League, Challenger Pro League, Croky Cup, divisions inférieures et discussions autour des clubs.', 0),
  ('Diables & sélections', 'diables-selections', 'Belgique A, Espoirs, jeunes, sélections, compositions et réactions aux matchs.', 1),
  ('Les Belges à l''étranger', 'belges-etranger', 'Performances, transferts, joueurs à suivre et leurs clubs à l''étranger.', 2),
  ('La Tribune', 'la-tribune', 'Débats plus libres : culture foot, souvenirs, maillots, stades, déplacements et discussions générales.', 3)
on conflict (slug) do nothing;

insert into public.schema_migrations (module, version)
values ('forum', '0002_noyau_structure') on conflict do nothing;

commit;
