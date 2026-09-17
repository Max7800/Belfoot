-- Compétition étrangère masquée, destinée au premier test ciblé Belges à l'étranger.
-- API-Football : EFL Championship = 40 ; Burnley = 44 ; saison gratuite utilisée = 2024.
alter table competitions add column if not exists public_visible boolean not null default true;

do $$
declare
  championship_id uuid;
begin
  select id into championship_id
  from competitions
  where (provider = 'apifootball' and external_id = '40')
     or slug = 'efl-championship'
  limit 1;

  if championship_id is null then
    insert into competitions (
      name, slug, provider, source, external_id, position, competition_type,
      public_visible, header_title, header_subtitle, ext
    ) values (
      'EFL Championship', 'efl-championship', 'apifootball', 'manual', '40', 100, 'league',
      false, 'EFL Championship',
      'La deuxième division anglaise, suivie à travers ses joueurs belges.',
      jsonb_build_object('country', 'England', 'season', '2024')
    ) returning id into championship_id;
  else
    update competitions set
      name = coalesce(nullif(name, ''), 'EFL Championship'),
      slug = coalesce(nullif(slug, ''), 'efl-championship'),
      provider = 'apifootball',
      external_id = '40',
      competition_type = coalesce(competition_type, 'league'),
      public_visible = false,
      ext = coalesce(ext, '{}'::jsonb) || jsonb_build_object('country', 'England', 'season', '2024')
    where id = championship_id;
  end if;

  if not exists (
    select 1 from seasons where competition_id = championship_id and label = '2024-2025'
  ) then
    insert into seasons (competition_id, label) values (championship_id, '2024-2025');
  end if;
end $$;
