-- Activation opérationnelle du direct Belfoot avec Supabase Cron.
-- Ce fichier n'est PAS une migration applicative : il ne change aucune donnée
-- football et peut être rejoué pour remplacer proprement le cron existant.
--
-- Avant de l'exécuter :
-- 1. Dans Vercel, créer CRON_SECRET (Production) avec une valeur aléatoire forte
--    et redéployer Belfoot.
-- 2. Dans Supabase > Vault, créer exactement ces deux secrets :
--      belfoot_site_url    = https://belfoot.vercel.app
--      belfoot_cron_secret = la même valeur que CRON_SECRET dans Vercel
-- 3. Exécuter ce fichier dans le SQL Editor Supabase.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'belfoot_site_url'
  ) then
    raise exception 'Secret Vault manquant : belfoot_site_url';
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets where name = 'belfoot_cron_secret'
  ) then
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
    select jobid from cron.job where jobname = 'belfoot-live-window'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'belfoot-live-window',
  '*/3 * * * *',
  $cron$
    select net.http_post(
      url := rtrim(
        (select decrypted_secret from vault.decrypted_secrets where name = 'belfoot_site_url'),
        '/'
      ) || '/api/cron/live-window',
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

-- Contrôle : le job doit apparaître actif avec schedule = */3 * * * *.
select jobid, jobname, schedule, active
from cron.job
where jobname = 'belfoot-live-window';

-- Pour couper le direct sans supprimer sa configuration :
-- update cron.job set active = false where jobname = 'belfoot-live-window';
-- Pour le réactiver :
-- update cron.job set active = true where jobname = 'belfoot-live-window';
