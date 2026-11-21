// Joueurs identifiés sur les feuilles de match de la saison sélectionnée.
// Ce n'est pas une liste officielle des effectifs du tournoi.
export function matchRosterByTeam(matchStats = [], players = []) {
  const known = new Map(players.map((player) => [player.id, player]));
  const teams = new Map();
  for (const row of matchStats) {
    if (!row.club_id || !row.player_id || !known.has(row.player_id)) continue;
    if (!teams.has(row.club_id)) teams.set(row.club_id, new Map());
    teams.get(row.club_id).set(row.player_id, known.get(row.player_id));
  }
  return teams;
}
