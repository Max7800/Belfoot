-- Style éditorial propre aux portes du portail /competitions.
-- Séparé du bandeau de la page détail pour pouvoir utiliser deux visuels différents.
alter table competitions add column if not exists portal_background_url text;
alter table competitions add column if not exists portal_border_color text;
alter table competitions add column if not exists portal_title text;
alter table competitions add column if not exists portal_subtitle text;
alter table competitions add column if not exists portal_overlay numeric;

