-- Activation du rafraîchissement automatique des COMPÉTITIONS de clubs (Belfoot) :
-- résultats, nouvelles journées et donc classements. Jumeau de live_cron_setup.sql :
-- réutilise les MÊMES secrets Vault (belfoot_site_url, belfoot_cron_secret).
-- Ne change aucune donnée football, rejouable sans risque. À exécuter dans le SQL Editor.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'belfoot_site_url') then
    raise exception 'Secret Vault manquant : belfoot_site_url';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'belfoot_cron_secret') then
    raise exception 'Secret Vault manquant : belfoot_cron_secret';
  end if;
end;
$$;

do $$
declare existing_job_id bigint;
begin
  for existing_job_id in select jobid from cron.job where jobname = 'belfoot-competition-refresh'
  loop perform cron.unschedule(existing_job_id); end loop;
end;
$$;

-- Toutes les 20 minutes : le cron décide lui-même quoi rafraîchir (fenêtre de match +
-- fraîcheur). Hors jour de match, chaque compétition n'est touchée qu'environ 1×/jour.
select cron.schedule(
  'belfoot-competition-refresh',
  '*/20 * * * *',
  $cron$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_site_url'), '/') || '/api/cron/competition-refresh',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    ) as request_id;
  $cron$
);

select jobid, jobname, schedule, active from cron.job where jobname = 'belfoot-competition-refresh';

-- Couper : update cron.job set active = false where jobname = 'belfoot-competition-refresh';
-- Réactiver : update cron.job set active = true where jobname = 'belfoot-competition-refresh';
