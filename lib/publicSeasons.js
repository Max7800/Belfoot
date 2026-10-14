export function sortPublicSeasons(rows = []) {
  const hasRolloutState = rows.some((row) => Object.prototype.hasOwnProperty.call(row, "import_status"));
  const visibleRows = hasRolloutState
    ? rows.filter((row) => row.public_active || ["ready", "active"].includes(row.import_status))
    : rows;
  return [...visibleRows].sort((a, b) => {
    if (Boolean(a.public_active) !== Boolean(b.public_active)) return a.public_active ? -1 : 1;
    return String(b.label || "").localeCompare(String(a.label || ""));
  });
}

export function preferredPublicSeason(rows = []) {
  return sortPublicSeasons(rows)[0] || null;
}

// Saisons visibles du public + signal « la compétition a des saisons, mais
// aucune n'est publiée » (message explicite, jamais de matchs mélangés).
// Aucune année n'est codée en dur : toute saison créée puis publiée (ready /
// active / public_active) apparaît d'elle-même ; un brouillon reste invisible.
export function publicSeasonState(rows = []) {
  const seasons = sortPublicSeasons(rows);
  return { seasons, unpublished: rows.length > 0 && seasons.length === 0 };
}

// Matchs d'une compétition limités à la saison affichée, même règle que
// loadSeasonMatches : sans saison publiée mais avec des saisons, aucun match ;
// le repli « tous les matchs » ne vaut que pour les anciens imports sans saison.
export function seasonScopedMatches(competitionSeasons = [], matches = [], activeSeasonId = null) {
  if (activeSeasonId) {
    const own = matches.filter((match) => match.season_id === activeSeasonId);
    return own.length || matches.some((match) => match.season_id) ? own : matches;
  }
  return competitionSeasons.length ? [] : matches;
}
