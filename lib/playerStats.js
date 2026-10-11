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
  const assigned = [...groups.values()].flatMap((group) => group.some((row) => row.club_id) ? group.filter((row) => row.club_id) : group);
  return withoutOrphanDuplicates(assigned);
}

// player_season_stats.competition_id (et season_id) sont en « on delete set
// null » : supprimer une compétition en double laisse ses lignes orphelines,
// sans compétition, alors que la même ligne a été réimportée dans la compétition
// conservée — elle était additionnée deux fois (ex. 19 matchs au lieu de 13).
// Une orpheline n'est écartée que si une ligne du même joueur, même club et même
// saison porte EXACTEMENT les mêmes chiffres ; sinon elle reste visible
// (« Non attribuée ») et comptée, faute de preuve qu'il s'agit d'un doublon.
const STAT_SIGNATURE = ["appearances", "lineups", "minutes", "goals", "assists", "yellow", "red"];
const signature = (row) => [row.player_id || "?", row.club_id || "?", seasonKey(row.season), ...STAT_SIGNATURE.map((key) => Number(row[key]) || 0)].join(":");

function withoutOrphanDuplicates(rows) {
  const attributed = new Set(rows.filter((row) => row.competition_id).map(signature));
  return rows.filter((row) => row.competition_id || !attributed.has(signature(row)));
}
