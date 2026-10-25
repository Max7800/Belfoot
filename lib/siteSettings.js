// Écritures de site_settings (ligne unique id = 1 : un JSON partagé par les
// panneaux d'administration, les crons et les jobs).
//
// Avant : chacun lisait tout le JSON, changeait sa clé et réécrivait TOUT.
// Une écriture intercalée (état du cron toutes les 20 min, plan d'import
// complété par le renouvellement de campagne, autre onglet) était effacée sans
// bruit. Maintenant : révision `_rev` dans le JSON, UPDATE conditionné par la
// révision lue (contrôle atomique côté Postgres) ; en cas de course, on relit
// et on réapplique — chaque écrivain ne remplace que SES clés.
//
// SQL manuel sur site_settings : incrémenter aussi `_rev`, par ex.
//   data = jsonb_set(data || '{...}', '{_rev}', to_jsonb(coalesce((data->>'_rev')::int, 0) + 1))

export const SETTINGS_REV_KEY = "_rev";
const MAX_ATTEMPTS = 8;
// Pause aléatoire croissante entre deux tentatives : sans elle, des écrivains
// simultanés se recognent en boucle (un seul gagne à chaque tour).
const backoff = (attempt) => new Promise((resolve) => setTimeout(resolve, Math.random() * 40 * attempt));

export class SettingsConflictError extends Error {
  constructor(keys) {
    super(`Réglage modifié entre-temps (${keys.join(", ")}) par un autre onglet, un cron ou un job : recharge la page avant d'enregistrer, rien n'a été écrasé.`);
    this.name = "SettingsConflictError";
    this.keys = keys;
  }
}

// Comparaison indépendante de l'ordre des clés (jsonb réordonne les objets).
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
export const sameSetting = (left, right) => JSON.stringify(stable(left ?? null)) === JSON.stringify(stable(right ?? null));

export async function readSiteSettings(db) {
  const { data, error } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Ligne site_settings introuvable.");
  return data.data || {};
}

// `patch` : { clé: valeur } ou (données actuelles) => { clé: valeur } | null
// (null : ne rien écrire ; la fonction est rappelée à chaque nouvelle tentative).
// `expected` : { clé: valeur lue à l'ouverture du formulaire } ; si la clé a
// changé depuis, refus (SettingsConflictError) au lieu d'écraser.
export async function updateSiteSettings(db, patch, { expected = null } = {}) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const current = await readSiteSettings(db);
    if (expected) {
      const changed = Object.keys(expected).filter((key) => !sameSetting(current[key], expected[key]));
      if (changed.length) throw new SettingsConflictError(changed);
    }
    const changes = typeof patch === "function" ? patch(current) : patch;
    if (changes === null) return null; // l'écrivain renonce après relecture : rien n'est écrit
    const rev = current[SETTINGS_REV_KEY] ?? null;
    const next = { ...current, ...changes, [SETTINGS_REV_KEY]: (Number(rev) || 0) + 1 };
    let query = db.from("site_settings").update({ data: next }).eq("id", 1);
    query = rev === null ? query.is(`data->>${SETTINGS_REV_KEY}`, null) : query.eq(`data->>${SETTINGS_REV_KEY}`, String(rev));
    const { data: saved, error } = await query.select("id");
    if (error) throw error;
    if (saved?.length) return next;
    // Révision changée entre la lecture et l'écriture : relire et réappliquer.
    if (attempt < MAX_ATTEMPTS) await backoff(attempt);
  }
  throw new Error("site_settings modifié en continu : enregistrement abandonné, réessaie dans un instant.");
}
