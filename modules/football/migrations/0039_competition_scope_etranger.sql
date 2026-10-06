-- Unifie la taxonomie des portées de compétition et isole les championnats ÉTRANGERS,
-- qui avaient hérité du défaut « national » (migration 0036) et passaient donc pour belges.
--
-- belgique      = compétitions belges de clubs (ex-« national »)
-- europe        = coupes d'Europe de clubs
-- etranger      = championnats étrangers (exilés belges), rangés par pays côté admin
-- international = Nations League / Euro / Coupe du monde + sélections nationales
--
-- Sans danger : ne touche qu'à la colonne de classement, aucune donnée sportive.

alter table public.competitions drop constraint if exists competitions_scope_check;

-- 1) Les championnats étrangers : portée « national » mais pays connu et non belge.
update public.competitions
set competition_scope = 'etranger'
where competition_scope = 'national'
  and coalesce(ext ->> 'country', '') <> ''
  and ext ->> 'country' not ilike '%belg%';

-- 2) Le reste des « national » = vraies compétitions belges de clubs.
update public.competitions
set competition_scope = 'belgique'
where competition_scope = 'national';

alter table public.competitions alter column competition_scope set default 'belgique';

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
      check (competition_scope in ('belgique', 'europe', 'etranger', 'international'));
  end if;
end
$$;

-- L'index public (0036) référençait l'ancienne colonne ; on le recrée à l'identique
-- pour rester cohérent avec les nouvelles valeurs (aucun changement de structure).
drop index if exists public.competitions_public_scope;
create index if not exists competitions_public_scope
on public.competitions (competition_scope, position, name)
where public_visible is not false;

insert into public.schema_migrations (module, version)
values ('football', '0039_competition_scope_etranger')
on conflict do nothing;
