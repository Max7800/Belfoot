-- Passage dédié aux DÉTAILS D'APRÈS-MATCH (compositions, statistiques joueurs et
-- collectives, faits) : même route que competition-refresh, mode ?pass=details.
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
  for existing_job_id in select jobid from cron.job where jobname = 'belfoot-match-details'
  loop perform cron.unschedule(existing_job_id); end loop;
end;
$$;

-- Toutes les 20 minutes, 10 minutes après le passage principal (:10, :30, :50) :
-- les deux passages ne se chevauchent jamais. Tant que celui-ci tourne, le passage
-- principal lui laisse les détails ; s'il est coupé, le principal les reprend après 45 min.
select cron.schedule(
  'belfoot-match-details',
  '10-59/20 * * * *',
  $cron$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_site_url'), '/') || '/api/cron/competition-refresh?pass=details',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    ) as request_id;
  $cron$
);

select jobid, jobname, schedule, active from cron.job where jobname = 'belfoot-match-details';

-- Couper : update cron.job set active = false where jobname = 'belfoot-match-details';
-- Réactiver : update cron.job set active = true where jobname = 'belfoot-match-details';
