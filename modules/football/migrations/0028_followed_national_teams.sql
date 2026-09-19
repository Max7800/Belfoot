begin;

-- Seules les sélections éditorialement suivies deviennent des onglets publics.
-- Les adversaires restent des équipes nationales afin d'afficher les matchs,
-- mais ne doivent jamais apparaître comme des variantes des Diables Rouges.
alter table public.clubs
  add column if not exists national_followed boolean not null default false;

update public.clubs
set national_followed = false
where team_type = 'national';

update public.clubs
set national_followed = true
where team_type = 'national'
  and lower(name) ~ '^belgium([[:space:]]|$)';

create index if not exists clubs_followed_national_teams_idx
  on public.clubs (national_followed, national_category)
  where team_type = 'national';

insert into public.schema_migrations (module, version)
values ('football', '0028_followed_national_teams')
on conflict do nothing;

commit;
