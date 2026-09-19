// Point d'entrée public « Proposer » — capacité moteur, pilotée par la config
// des collections + une surcouche administrable dans site_settings.data.propose.
//
// Extensible sans dev : toute collection déclarée avec `contribute: true`
// (config/collections.js) apparaît automatiquement ici et dans l'admin.
import { collectionList } from "@/config/collections";

// Types de contribution disponibles = collections contribuables.
export function proposeTypes() {
  return collectionList()
    .filter((c) => c.contribute)
    .map((c) => ({
      key: c.key,
      label: c.labelSingular || c.label,
      icon: c.icon || "plus",
      route: `/proposer/${c.key}`,
    }));
}

export const DEFAULT_PROPOSE_HUB = {
  kicker: "Participer",
  title: "Proposer un contenu",
  intro:
    "Une info, une rumeur mercato, un joueur à suivre ou une correction ? Envoie ta proposition : elle passe en modération avant publication.",
};

// Fusionne les défauts (config) avec la surcouche admin (site_settings.data.propose).
// Renvoie { hub: {kicker,title,intro}, types: [{key,label,icon,route,enabled,order}] }.
export function normalizeProposeConfig(raw = {}) {
  const conf = (raw && raw.types) || {};
  const types = proposeTypes()
    .map((t, i) => ({
      ...t,
      label: conf[t.key]?.label || t.label,
      enabled: conf[t.key]?.enabled !== false,
      order: conf[t.key]?.order ?? i,
    }))
    .sort((a, b) => a.order - b.order);
  return { hub: { ...DEFAULT_PROPOSE_HUB, ...((raw && raw.hub) || {}) }, types };
}
