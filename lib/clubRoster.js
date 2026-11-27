const seasonYear = (value) => Number((String(value || "").match(/\d{4}/) || [0])[0]);

// Les affectations inactives restent pertinentes dans une archive, pas dans
// l'effectif courant. Une saison demandée ne doit jamais changer par repli.
export function selectClubRoster({ memberships = [], players = [], requestedYear = 0, contextYear = 0, currentYear }) {
  const years = memberships.map((row) => row.season_start_year || seasonYear(row.season)).filter(Boolean);
  const rosterYear = requestedYear || contextYear || Math.max(0, ...years);
  const rosterMemberships = memberships.filter((row) => {
    const year = row.season_start_year || seasonYear(row.season);
    return (!rosterYear || year === rosterYear) && (rosterYear !== currentYear || row.active !== false);
  });
  const membershipByPlayer = new Map(rosterMemberships.map((row) => [row.player_id, row]));
  const squad = memberships.length
    ? players.filter((player) => membershipByPlayer.has(player.id))
    : (!rosterYear || rosterYear === currentYear ? players : []);
  return { rosterYear, membershipByPlayer, squad };
}
