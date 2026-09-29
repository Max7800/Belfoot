-- Distingue la/les nationalités civiles de la sélection représentée.
alter table public.players
  add column if not exists national_team_id uuid references public.clubs(id) on delete set null;

alter table public.players
  add column if not exists national_team_locked boolean not null default false;

create index if not exists players_national_team_idx
  on public.players (national_team_id)
  where national_team_id is not null;

-- Reprend uniquement les convocations seniors déjà connues et ne remplace jamais
-- une affectation éditoriale existante.
update public.players as player
set national_team_id = inferred.national_team_id
from (
  select distinct on (callup.player_id)
    callup.player_id,
    callup.national_team_id
  from public.national_team_callups as callup
  join public.clubs as team on team.id = callup.national_team_id
  where callup.active = true
    and team.team_type = 'national'
    and team.national_category = 'senior'
  order by callup.player_id, callup.updated_at desc nulls last
) as inferred
where player.id = inferred.player_id
  and player.national_team_id is null;

insert into public.schema_migrations (module, version)
values ('football', '0038_player_national_team')
on conflict do nothing;
