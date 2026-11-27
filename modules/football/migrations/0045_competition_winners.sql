-- Palmarès éditorial : ne pas déduire les champions depuis des données partielles.
alter table competitions add column if not exists winners_history jsonb not null default '[]'::jsonb;
