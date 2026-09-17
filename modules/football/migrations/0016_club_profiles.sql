-- Contenu éditorial des fiches clubs. Ces champs ne sont jamais remplacés par
-- les synchronisations sportives sauf action explicite dans l'administration.
alter table clubs add column if not exists nickname text;
alter table clubs add column if not exists founded_year int;
alter table clubs add column if not exists description text;
alter table clubs add column if not exists website_url text;
alter table clubs add column if not exists primary_color text;
alter table clubs add column if not exists secondary_color text;
alter table clubs add column if not exists stadium_name text;
alter table clubs add column if not exists stadium_capacity int;
alter table clubs add column if not exists stadium_address text;
alter table clubs add column if not exists stadium_image_url text;
alter table clubs add column if not exists honours jsonb not null default '[]';
