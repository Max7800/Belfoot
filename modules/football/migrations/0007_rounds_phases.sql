-- Rounds/phases génériques (championnat à journées OU coupe à tours).
alter table matches add column if not exists round_raw text;     -- libellé exact provider
alter table matches add column if not exists phase text;         -- phase normalisée
alter table matches add column if not exists round_number int;   -- numéro si applicable
create index if not exists matches_phase on matches (competition_id, phase, round_number);
