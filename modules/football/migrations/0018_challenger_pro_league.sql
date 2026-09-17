-- Prépare la Challenger Pro League comme compétition autonome.
-- API-Football : league id 145. La saison 2024 reste accessible avec le plan gratuit.
-- Aucun classement/zones n'est imposé ici : ces règles restent éditables par saison/phase.
-- Garde-fou pour les bases historiques où la migration 0014 n'a pas été jouée.
alter table competitions add column if not exists public_visible boolean not null default true;

do $$
declare
  challenger_id uuid;
begin
  select id into challenger_id
  from competitions
  where external_id = '145'
     or slug = 'challenger-pro-league'
  order by case when slug = 'challenger-pro-league' then 0 else 1 end
  limit 1;

  if challenger_id is null then
    insert into competitions (
      name, slug, provider, source, external_id, position, competition_type,
      public_visible, header_title, header_subtitle
    ) values (
      'Challenger Pro League', 'challenger-pro-league', 'apifootball', 'manual', '145', 10, 'league',
      true, 'Challenger Pro League',
      'L''antichambre du football belge, entre ambitions et jeunes talents.'
    ) returning id into challenger_id;
  else
    update competitions set
      name = 'Challenger Pro League',
      slug = 'challenger-pro-league',
      provider = 'apifootball',
      external_id = '145',
      position = coalesce(position, 10),
      competition_type = coalesce(competition_type, 'league'),
      public_visible = true,
      header_title = coalesce(header_title, 'Challenger Pro League'),
      header_subtitle = coalesce(header_subtitle, 'L''antichambre du football belge, entre ambitions et jeunes talents.')
    where id = challenger_id;
  end if;

  if not exists (
    select 1 from seasons
    where competition_id = challenger_id and label = '2024-2025'
  ) then
    insert into seasons (competition_id, label)
    values (challenger_id, '2024-2025');
  end if;
end $$;
