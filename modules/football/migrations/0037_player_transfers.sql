-- Mercato saisonnier : source dédiée pour l'historique et la correction des effectifs.
create table if not exists public.player_transfers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.players(id) on delete set null,
  player_external_id text not null,
  player_name text not null,
  from_club_id uuid references public.clubs(id) on delete set null,
  to_club_id uuid references public.clubs(id) on delete set null,
  from_club_external_id text,
  to_club_external_id text,
  from_club_name text,
  to_club_name text,
  transfer_date date not null,
  transfer_type text,
  season_start_year integer not null,
  source text not null default 'manual',
  external_id text not null,
  ext jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists player_transfers_season_date
  on public.player_transfers (season_start_year, transfer_date desc);
create index if not exists player_transfers_from_club
  on public.player_transfers (from_club_id, season_start_year);
create index if not exists player_transfers_to_club
  on public.player_transfers (to_club_id, season_start_year);

alter table public.player_transfers enable row level security;

drop policy if exists "player_transfers_read" on public.player_transfers;
create policy "player_transfers_read"
  on public.player_transfers for select using (true);

drop policy if exists "player_transfers_write" on public.player_transfers;
create policy "player_transfers_write"
  on public.player_transfers for all
  using (is_admin()) with check (is_admin());

insert into public.schema_migrations (module, version)
values ('football', '0037_player_transfers')
on conflict do nothing;
