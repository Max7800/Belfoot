-- Type de compétition (n'exclut jamais les coupes des listes)
alter table competitions add column if not exists competition_type text default 'league';  -- league | cup
-- Relations d'équipes (réserve / U23…) — effectifs/matchs/stats restent séparés par équipe
alter table clubs add column if not exists parent_club_id uuid references clubs(id) on delete set null;
alter table clubs add column if not exists team_type text default 'first_team';  -- first_team | reserve | u23 | women
