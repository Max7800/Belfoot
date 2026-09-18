-- Empêche un membre de modifier son propre rôle via le client Supabase.
-- Le trigger handle_new_user() (security definer) reste seul responsable de
-- l'insertion initiale. Les promotions passent par la RPC admin ci-dessous.

drop policy if exists "profiles_insert" on public.profiles;
revoke insert on table public.profiles from anon, authenticated;

-- RLS filtre les lignes et les grants filtrent désormais les colonnes : un
-- membre peut modifier son pseudo, jamais son rôle/id/date de création.
revoke update on table public.profiles from anon, authenticated;
grant update (username) on table public.profiles to authenticated;

create or replace function public.set_profile_role(target_id uuid, next_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
  admin_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if next_role not in ('member', 'admin') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  select role into current_role
  from public.profiles
  where id = target_id
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  -- Toujours conserver au moins un administrateur.
  if current_role = 'admin' and next_role = 'member' then
    select count(*) into admin_count
    from public.profiles
    where role = 'admin';

    if admin_count <= 1 then
      raise exception 'Cannot demote the last admin' using errcode = '23514';
    end if;
  end if;

  update public.profiles
  set role = next_role
  where id = target_id;

  insert into public.audit_log (actor, action, target_table, target_id, meta)
  values (
    auth.uid(),
    'profile.role.change',
    'profiles',
    target_id,
    jsonb_build_object('previous_role', current_role, 'next_role', next_role)
  );
end;
$$;

revoke all on function public.set_profile_role(uuid, text) from public, anon;
grant execute on function public.set_profile_role(uuid, text) to authenticated;

insert into public.schema_migrations (module, version)
values ('core', '0002_profile_role_hardening')
on conflict do nothing;
