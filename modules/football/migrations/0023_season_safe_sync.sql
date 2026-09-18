-- Tous les imports doivent rattacher les matchs à une saison unique. La base
-- 2024/2025 reste utilisée pour le développement avant la future bascule 2026/2027.
-- Vérifier d'abord qu'il n'existe pas de doublon (competition_id, label).

create unique index if not exists seasons_competition_label_unique
on seasons (competition_id, label);

insert into public.schema_migrations (module, version)
values ('football', '0023_season_safe_sync')
on conflict do nothing;
