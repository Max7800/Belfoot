// Les modules affichés simultanément partagent uniquement la lecture en cours.
// Une prochaine navigation peut relire les changements de l'administration.
const pending = new WeakMap();
export function readSiteSettings(db) {
  if (pending.has(db)) return pending.get(db);
  const promise = Promise.resolve(db.from("site_settings").select("data").eq("id", 1).maybeSingle())
    .finally(() => pending.delete(db));
  pending.set(db, promise);
  return promise;
}
