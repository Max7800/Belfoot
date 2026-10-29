-- Pipelines continués par le serveur : plus besoin de laisser l'onglet d'administration
-- ouvert. Un lot par passage, seulement pour une pause « lot terminé dans le budget »
-- (une erreur, un budget épuisé ou un retrait restent à reprendre à la main).
-- Réutilise les MÊMES secrets Vault (belfoot_site_url, belfoot_cron_secret).
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
  for existing_job_id in select jobid from cron.job where jobname = 'belfoot-pipeline-continue'
  loop perform cron.unschedule(existing_job_id); end loop;
end;
$$;

-- Toutes les 2 minutes : sans pipeline en attente, le passage ne fait qu'une lecture.
select cron.schedule(
  'belfoot-pipeline-continue',
  '*/2 * * * *',
  $cron$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_site_url'), '/') || '/api/cron/pipeline-continue',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    ) as request_id;
  $cron$
);

select jobid, jobname, schedule, active from cron.job where jobname = 'belfoot-pipeline-continue';

-- Couper : update cron.job set active = false where jobname = 'belfoot-pipeline-continue';
-- Réactiver : update cron.job set active = true where jobname = 'belfoot-pipeline-continue';
