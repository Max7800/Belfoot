// Joueurs identifiés sur les feuilles de match de la saison sélectionnée.
// Ce n'est pas une liste officielle des effectifs du tournoi.
export function matchRosterByTeam(matchStats = [], players = []) {
  const known = new Map(players.map((player) => [player.id, player]));
  const teams = new Map();
  const linkedExternal = new Set(matchStats.filter((row) => row.club_id && row.player_id && known.has(row.player_id) && row.source && row.player_external_id).map((row) => JSON.stringify([row.club_id, row.source, row.player_external_id])));
  for (const row of matchStats) {
    if (!row.club_id) continue;
    const player = known.get(row.player_id);
    const externalKey = row.source && row.player_external_id ? JSON.stringify([row.club_id, row.source, row.player_external_id]) : null;
    if (!player && (!externalKey || !row.player_name?.trim() || linkedExternal.has(externalKey))) continue;
    if (!teams.has(row.club_id)) teams.set(row.club_id, new Map());
    if (player) teams.get(row.club_id).set(player.id, player);
    else teams.get(row.club_id).set(`source:${externalKey}`, { id: null, rosterKey: externalKey, name: row.player_name.trim(), position: row.position });
  }
  return teams;
}
