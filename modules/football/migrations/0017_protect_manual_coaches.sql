-- Les entraîneurs déjà saisis à la main doivent rester prioritaires sur le provider.
-- Les nouveaux entraîneurs manuels peuvent être protégés via la case correspondante dans l'admin.
update coaches
set locked = true
where source = 'manual'
  and external_id is null;
