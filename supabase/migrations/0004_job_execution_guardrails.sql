-- Rend les synchronisations observables et empêche deux exécutions identiques
-- de consommer le quota provider en parallèle.

alter table public.job_runs
  add column if not exists target_key text not null default 'all',
  add column if not exists request_count integer not null default 0,
  add column if not exists request_limit integer,
  add column if not exists quota_remaining integer,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists params jsonb not null default '{}'::jsonb;

update public.job_runs
set heartbeat_at = coalesce(heartbeat_at, finished_at, started_at)
where heartbeat_at is null;

-- Une migration est appliquée hors exécution normale : toute ancienne ligne
-- restée sur running correspond à un job interrompu, pas à un processus actif.
update public.job_runs
set status = 'timeout',
    detail = coalesce(detail, 'Exécution historique fermée lors de l’installation des garde-fous.'),
    finished_at = coalesce(finished_at, now())
where status = 'running';

create unique index if not exists job_runs_one_active_target
on public.job_runs (job_key, target_key)
where status = 'running';

create index if not exists job_runs_recent
on public.job_runs (started_at desc);

insert into public.schema_migrations (module, version)
values ('core', '0004_job_execution_guardrails')
on conflict do nothing;
