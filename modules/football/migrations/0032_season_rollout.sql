-- Bascule de saison progressive : une saison importée n'est jamais rendue
-- publique simplement parce qu'elle est la plus récente.

alter table public.seasons
  add column if not exists import_status text not null default 'draft',
  add column if not exists public_active boolean not null default false,
  add column if not exists activated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'seasons_import_status_check'
      and conrelid = 'public.seasons'::regclass
  ) then
    alter table public.seasons add constraint seasons_import_status_check
      check (import_status in ('draft', 'importing', 'ready', 'active', 'error'));
  end if;
end $$;

-- Les saisons de développement déjà présentes restent prêtes. Une éventuelle
-- saison 2026 précréée reste volontairement en brouillon.
update public.seasons
set import_status = 'ready'
where import_status = 'draft'
  and label !~ '^2026';

-- Conserve une seule saison publique par compétition. Si aucune n'était
-- déclarée, la plus récente hors 2026 devient la référence existante.
with ranked as (
  select id, competition_id,
         row_number() over (partition by competition_id order by label desc, id desc) as rn
  from public.seasons
  where label !~ '^2026'
), candidates as (
  select ranked.id
  from ranked
  where ranked.rn = 1
    and not exists (
      select 1 from public.seasons active
      where active.competition_id = ranked.competition_id
        and active.public_active = true
    )
)
update public.seasons season
set public_active = true,
    import_status = 'active',
    activated_at = coalesce(activated_at, now())
where season.id in (select id from candidates);

create unique index if not exists seasons_one_public_active_per_competition
on public.seasons (competition_id)
where public_active = true;

create index if not exists seasons_rollout_status
on public.seasons (competition_id, import_status, label desc);

create or replace function public.activate_competition_season(target_season uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_competition uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin requis';
  end if;

  select competition_id into target_competition
  from public.seasons
  where id = target_season;

  if target_competition is null then
    raise exception 'Saison introuvable';
  end if;

  if not exists (
    select 1 from public.seasons
    where id = target_season and import_status in ('ready', 'active')
  ) then
    raise exception 'La saison doit être prête avant son activation';
  end if;

  update public.seasons
  set public_active = false,
      import_status = case when import_status = 'active' then 'ready' else import_status end,
      activated_at = case when public_active then null else activated_at end
  where competition_id = target_competition;

  update public.seasons
  set public_active = true,
      import_status = 'active',
      activated_at = now()
  where id = target_season;
end;
$$;

revoke all on function public.activate_competition_season(uuid) from public;
grant execute on function public.activate_competition_season(uuid) to authenticated;

insert into public.schema_migrations (module, version)
values ('football', '0032_season_rollout')
on conflict do nothing;
