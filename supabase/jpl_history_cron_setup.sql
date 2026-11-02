-- À exécuter uniquement après accord pour l'activation en production.
-- Réutilise les secrets Vault des crons Belfoot existants. Aucun appel API
-- tant que football_jpl_history_enabled n'est pas activé dans l'administration.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'belfoot_site_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'belfoot_cron_secret') then
    raise exception 'Secrets Vault Belfoot manquants';
  end if;
end;
$$;

do $$
declare existing_job_id bigint;
begin
  for existing_job_id in select jobid from cron.job where jobname = 'belfoot-jpl-history'
  loop perform cron.unschedule(existing_job_id); end loop;
end;
$$;

select cron.schedule('belfoot-jpl-history', '7 * * * *', $cron$
  select net.http_post(
    url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_site_url'), '/') || '/api/cron/jpl-history',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 55000
  );
$cron$);

select jobid, jobname, schedule, active from cron.job where jobname = 'belfoot-jpl-history';
