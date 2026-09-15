alter table competitions add column if not exists banner_url text;   -- bannière décorative (sans texte)
alter table competitions add column if not exists zones jsonb not null default '[]';  -- [{label,color,from,to}]
