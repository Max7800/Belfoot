-- Classe les compétitions dans le portail sans déduire leur portée de leur nom.
-- national = compétitions belges de clubs
-- europe = compétitions européennes de clubs (tous les participants)
-- international = compétitions de sélections nationales

alter table public.competitions
  add column if not exists competition_scope text not null default 'national';

update public.competitions
set competition_scope = 'international'
where ext ->> 'imported_for' = 'national-teams'
  and competition_scope = 'national';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'competitions_scope_check'
      and conrelid = 'public.competitions'::regclass
  ) then
    alter table public.competitions
      add constraint competitions_scope_check
      check (competition_scope in ('national', 'europe', 'international'));
  end if;
end
$$;

create index if not exists competitions_public_scope
on public.competitions (competition_scope, position, name)
where public_visible is not false;

insert into public.schema_migrations (module, version)
values ('football', '0036_competition_scope')
on conflict do nothing;
