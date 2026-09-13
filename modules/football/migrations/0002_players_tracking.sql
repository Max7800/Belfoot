-- Champs cœur Belfoot pour les joueurs (suivi des Belges).
alter table players add column if not exists nationality text;
alter table players add column if not exists competition text;        -- championnat (texte pour l'instant)
alter table players add column if not exists active boolean not null default true;   -- actif / inactif
alter table players add column if not exists tracked boolean not null default false;  -- statut de suivi Belfoot
-- (source / external_id / ext / locked / synced_at déjà présents via 0001_init)
