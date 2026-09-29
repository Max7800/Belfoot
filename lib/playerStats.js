function seasonKey(value) {
  return (String(value || "").match(/\d{4}/) || [String(value || "")])[0];
}

// Les anciennes synchronisations pouvaient conserver une ligne agrégée sans
// club en plus des lignes détaillées par club. Additionner les deux double les
// statistiques (par exemple 21 + une ancienne valeur de 18). Dès qu'une ligne
// attribuée existe pour un joueur/compétition/saison, elle est plus précise et
// la ligne legacy sans club ne doit plus participer aux totaux publics.
export function preferAssignedPlayerStats(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = [row.player_id || "?", row.competition_id || "?", seasonKey(row.season)].join(":");
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => group.some((row) => row.club_id) ? group.filter((row) => row.club_id) : group);
}
