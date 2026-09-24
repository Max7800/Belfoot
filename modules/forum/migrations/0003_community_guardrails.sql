-- 0003_community_guardrails.sql — consolidation sécurité du forum (au niveau base).
-- Idempotent, additif. Ne modifie pas 0001/0002.
begin;

-- Pas de réponse dans un sujet verrouillé (imposé côté base, plus seulement l'UI).
drop policy if exists "fpost_write" on forum_posts;
create policy "fpost_write" on forum_posts for insert
  with check (author = auth.uid()
    and exists (select 1 from forum_topics t where t.id = topic_id and t.locked = false));

-- Un seul sujet lié par entité (match / joueur / club / article).
create unique index if not exists forum_topics_ref_unique
  on forum_topics (ref_type, ref_id) where ref_type is not null and ref_id is not null;

-- Limites de longueur (garde-fous de base).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'forum_posts_body_len') then
    alter table forum_posts add constraint forum_posts_body_len check (char_length(body) between 1 and 10000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forum_topics_title_len') then
    alter table forum_topics add constraint forum_topics_title_len check (char_length(title) between 1 and 200);
  end if;
end $$;

-- Anti-flood basique : pas plus d'un message toutes les 10 s par membre.
create or replace function forum_antiflood() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from forum_posts p
    where p.author = NEW.author and p.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Tu écris trop vite, patiente quelques secondes.';
  end if;
  return NEW;
end $$;
drop trigger if exists forum_posts_antiflood on forum_posts;
create trigger forum_posts_antiflood before insert on forum_posts
  for each row execute function forum_antiflood();

insert into public.schema_migrations (module, version)
values ('forum', '0003_community_guardrails') on conflict do nothing;

commit;
