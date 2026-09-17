-- Fondation du suivi des Belges à l'étranger.
-- Les compétitions étrangères peuvent alimenter le suivi sans encombrer les pages publiques.
alter table competitions
  add column if not exists public_visible boolean not null default true;

alter table players
  add column if not exists country text;

create index if not exists players_belgians_abroad
  on players (tracked, active, nationality, country);
