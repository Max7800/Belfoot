-- Pipelines durables : l'étape suivante et le budget consommé survivent à un
-- rechargement de l'admin ou à une interruption de la fonction serveur.

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  pipeline_key text not null,
  target_key text not null,
  status text not null default 'running'
    check (status in ('running', 'paused', 'error', 'ok')),
  params jsonb not null default '{}'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  next_step integer not null default 0 check (next_step >= 0),
  request_count integer not null default 0 check (request_count >= 0),
  request_limit integer not null check (request_limit > 0),
  quota_remaining integer,
  detail text,
  created_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.pipeline_runs enable row level security;

drop policy if exists "pipeline_runs_read" on public.pipeline_runs;
create policy "pipeline_runs_read" on public.pipeline_runs
  for select using (public.is_admin());

create unique index if not exists pipeline_runs_one_active_target
on public.pipeline_runs (pipeline_key, target_key)
where status = 'running';

create index if not exists pipeline_runs_recent
on public.pipeline_runs (started_at desc);

insert into public.schema_migrations (module, version)
values ('core', '0005_persistent_pipeline_runs')
on conflict do nothing;
