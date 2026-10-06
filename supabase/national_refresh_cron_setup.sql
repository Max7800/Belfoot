-- Activation du rafraîchissement automatique des sélections nationales (Belfoot).
-- Jumeau de live_cron_setup.sql : réutilise les MÊMES secrets Vault
-- (belfoot_site_url, belfoot_cron_secret) — aucun nouveau secret à créer.
-- Ce fichier ne change aucune donnée football et peut être rejoué sans risque.
--
-- Pré-requis : les deux secrets Vault existent déjà (installés avec le cron live).
-- Exécuter ce fichier dans le SQL Editor Supabase.

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

-- Idempotence : une seule planification active porte ce nom.
do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid from cron.job where jobname = 'belfoot-national-refresh'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end;
$$;

-- Toutes les 15 minutes : le cron décide lui-même quoi rafraîchir (seuils de
-- fraîcheur + fenêtre de match). Hors fenêtre, il ne dépense quasiment rien.
select cron.schedule(
  'belfoot-national-refresh',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := rtrim(
        (select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_site_url'),
        '/'
      ) || '/api/cron/national-refresh',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'belfoot_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    ) as request_id;
  $cron$
);

-- Contrôle : le job doit apparaître actif avec schedule = */15 * * * *.
select jobid, jobname, schedule, active
from cron.job
where jobname = 'belfoot-national-refresh';

-- Pour couper sans supprimer la configuration :
-- update cron.job set active = false where jobname = 'belfoot-national-refresh';
-- Pour réactiver :
-- update cron.job set active = true where jobname = 'belfoot-national-refresh';
