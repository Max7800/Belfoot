alter table competitions add column if not exists slug text;
create unique index if not exists competitions_slug on competitions (slug) where slug is not null;
