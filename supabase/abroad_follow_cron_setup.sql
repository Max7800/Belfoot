-- À installer après déploiement de la route ?pass=abroad.
-- Passage indépendant : :05, :25 et :45 UTC, entre les autres passages.
-- Maximum théorique : 12 appels API par passage, soit 864 par jour.
-- Réutilise les secrets Vault existants. Cette installation programme des
-- synchronisations de production : vérifier la PR et le quota avant exécution.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job_id bigint;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'belfoot_site_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'belfoot_cron_secret') then
    raise exception 'Secrets Vault belfoot_site_url et belfoot_cron_secret requis';
  end if;
  for existing_job_id in select jobid from cron.job where jobname = 'belfoot-abroad-follow'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
  perform cron.schedule(
    'belfoot-abroad-follow',
    '5-59/20 * * * *',
    $cron$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_site_url'), '/') || '/api/cron/competition-refresh?pass=abroad',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      );
    $cron$
  );
end
$$;

select jobid, jobname, schedule, active from cron.job where jobname = 'belfoot-abroad-follow';
