-- Bucket public pour les images éditoriales, avec écriture cloisonnée par rôle
-- et par utilisateur. Les anciens fichiers à la racine restent publiquement lus.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media_public_read" on storage.objects;
drop policy if exists "media_admin_insert" on storage.objects;
drop policy if exists "media_contributor_insert" on storage.objects;
drop policy if exists "media_admin_delete" on storage.objects;
drop policy if exists "media_contributor_delete" on storage.objects;
-- Noms utilisés par l'ancienne configuration manuelle. Ces policies autorisaient
-- tout membre connecté à écrire, modifier ou supprimer n'importe quel média.
drop policy if exists "media_insert" on storage.objects;
drop policy if exists "media_update" on storage.objects;
drop policy if exists "media_delete" on storage.objects;

create policy "media_public_read"
on storage.objects for select
using (bucket_id = 'media');

create policy "media_admin_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'media'
  and public.is_admin()
  and (storage.foldername(name))[1] = 'admin'
  and (storage.foldername(name))[2] = auth.uid()::text
  and lower(storage.extension(name)) = 'webp'
);

create policy "media_contributor_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = 'contributions'
  and (storage.foldername(name))[2] = auth.uid()::text
  and lower(storage.extension(name)) = 'webp'
);

create policy "media_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'media' and public.is_admin());

create policy "media_contributor_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = 'contributions'
  and (storage.foldername(name))[2] = auth.uid()::text
);

insert into public.schema_migrations (module, version)
values ('core', '0003_media_storage_hardening')
on conflict do nothing;
