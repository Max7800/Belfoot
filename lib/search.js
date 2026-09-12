// Registre de recherche. v1 : entries en plein-texte. Extensible : chaque module
// activé peut fournir son provider (même contrat). Résultats unifiés.
import { entriesProvider } from "./search/entries";
import { enabledModules } from "./modules";
import footballSearch from "@/modules/football/search";

const MODULE_PROVIDERS = { football: footballSearch };

export function providers() {
  const mods = enabledModules().map((m) => MODULE_PROVIDERS[m.key]).filter(Boolean);
  return [entriesProvider, ...mods];
}

// Tous les types disponibles (pour les filtres de l'UI).
export function searchTypes() {
  return providers().flatMap((p) => p.types);
}

// Lance tous les fournisseurs, fusionne, filtre par types si demandé.
export async function searchAll(query, { types, locale } = {}) {
  const lists = await Promise.all(providers().map((p) => p.search(query, { locale }).catch(() => [])));
  let results = lists.flat();
  if (types?.length) results = results.filter((r) => types.includes(r.type));
  return results;
}
