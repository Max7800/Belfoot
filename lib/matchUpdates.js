// Actualisation en direct des matchs : règle de fusion, sans dépendance au
// client Supabase (testable). Le branchement Realtime est dans
// lib/useCompetitionMatchUpdates.js.

// Applique une ligne reçue à la liste affichée.
// - Fusion avec le match connu : un champ absent de l'événement (valeur TOAST
//   inchangée, non renvoyée par Postgres) n'efface jamais la valeur connue.
// - Isolation des saisons : un match d'une autre saison est ignoré ; un match
//   déplacé vers une autre saison sort de la liste.
// - Match inconnu : ignoré (ses clubs ne sont pas chargés).
// Retourne la même liste si rien ne change (aucun rendu inutile).
export function mergeMatchUpdate(matches, row, seasonId = null) {
  if (!row?.id) return matches;
  const index = matches.findIndex((match) => match.id === row.id);
  if (index < 0) return matches;
  const merged = { ...matches[index] };
  for (const [key, value] of Object.entries(row)) if (value !== undefined) merged[key] = value;
  if (seasonId && merged.season_id !== seasonId) return matches.filter((match) => match.id !== row.id);
  const next = [...matches];
  next[index] = merged;
  return next;
}
