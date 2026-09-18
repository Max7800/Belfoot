-- Répare les bases où la migration Belges à l'étranger 0014 n'a été appliquée
-- que partiellement, puis force PostgREST à rafraîchir son cache de schéma.
alter table players add column if not exists country text;

create index if not exists players_belgians_abroad
  on players (tracked, active, nationality, country);

notify pgrst, 'reload schema';
