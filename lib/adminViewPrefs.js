// Préférences d'AFFICHAGE des pages d'administration (catégories repliées,
// éléments masqués, filtres) : mémorisées dans ce navigateur seulement. Elles
// ne modifient jamais le plan d'import ni aucune donnée ; masquer une
// compétition ne l'exclut d'aucun import.
import { useCallback, useEffect, useState } from "react";
import { matchesQuery } from "./textMatch";

export const VIEW_PREFS_PREFIX = "belfoot.admin.view.";
// Partagé par « Plan d'import » et « Saisons » : ce qui n'intéresse pas
// l'administrateur est masqué aux deux endroits.
export const HIDDEN_COMPETITIONS_KEY = "hidden-competitions";

function storage() {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function readViewPrefs(key, defaults, store = storage()) {
  try {
    const raw = store?.getItem(VIEW_PREFS_PREFIX + key);
    if (!raw) return defaults;
    const value = JSON.parse(raw);
    if (Array.isArray(defaults)) return Array.isArray(value) ? value : defaults;
    return value && typeof value === "object" && !Array.isArray(value) ? { ...defaults, ...value } : defaults;
  } catch {
    return defaults;
  }
}

export function writeViewPrefs(key, value, store = storage()) {
  try { store?.setItem(VIEW_PREFS_PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

// Valeurs par défaut au premier rendu (identique serveur / client), puis
// lecture du navigateur : pas d'écart d'hydratation.
export function useViewPrefs(key, defaults) {
  const [value, setValue] = useState(defaults);
  useEffect(() => { setValue(readViewPrefs(key, defaults)); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = useCallback((next) => setValue((current) => {
    const resolved = typeof next === "function" ? next(current) : next;
    writeViewPrefs(key, resolved);
    return resolved;
  }), [key]);
  return [value, update];
}

// Recherche insensible à la casse et aux accents : règle partagée avec la
// recherche publique (lib/textMatch.js).
export { matchesQuery };

export function toggleInList(list, id) {
  const key = String(id);
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
}

// Filtre d'affichage commun : recherche, éléments masqués, « autorisées seulement ».
export function visibleItems(items, { query = "", hidden = [], showHidden = false, onlyAllowed = false, idOf = (item) => item.id, fieldsOf = (item) => [item.name], isAllowed = () => true } = {}) {
  const hiddenSet = new Set(hidden.map(String));
  return items.filter((item) => (showHidden || !hiddenSet.has(String(idOf(item))))
    && (!onlyAllowed || isAllowed(item))
    && matchesQuery(fieldsOf(item), query));
}
