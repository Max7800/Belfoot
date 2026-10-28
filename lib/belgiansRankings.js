const year = (value) => Number((String(value || "").match(/\d{4}/) || [0])[0]);

// Chiffres de saison : statistiques des compétitions importées, sinon ceux du
// balayage des championnats (players.ext.league_stats) — championnats étrangers
// non importés, où joue la majorité des Belges.
export function seasonTotals(rows = [], leagueStats = null) {
  const totals = latestTotals(rows);
  if (totals.appearances || !leagueStats?.appearances) return totals;
  const rating = Number(leagueStats.rating) > 0 ? Number(leagueStats.rating) : null;
  return { season: year(leagueStats.season) || totals.season, appearances: Number(leagueStats.appearances) || 0, minutes: Number(leagueStats.minutes) || 0, goals: Number(leagueStats.goals) || 0, assists: Number(leagueStats.assists) || 0, rating };
}

export function latestTotals(rows = []) {
  const latest = Math.max(0, ...rows.map((row) => year(row.season)));
  const selected = latest ? rows.filter((row) => year(row.season) === latest) : rows;
  const sum = (key) => selected.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const ratings = selected.filter((row) => Number(row.rating) > 0).map((row) => Number(row.rating));
  return { season: latest || "—", appearances: sum("appearances"), minutes: sum("minutes"), goals: sum("goals"), assists: sum("assists"), rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null };
}

// Classements des Belges à l'étranger (saison en cours) : buteurs, passeurs,
// notes (au moins 3 matchs joués).
export function rankBelgians(items) {
  const top = (key, value, filter = () => true) => items.filter((item) => filter(item) && value(item) > 0).sort((a, b) => value(b) - value(a) || a.player.name.localeCompare(b.player.name, "fr")).slice(0, 5).map((item) => ({ item, value: value(item) }));
  return [
    { key: "goals", title: "Buteurs", rows: top("goals", (item) => item.totals.goals), format: (value) => `${value} but${value > 1 ? "s" : ""}` },
    { key: "assists", title: "Passeurs", rows: top("assists", (item) => item.totals.assists), format: (value) => `${value} passe${value > 1 ? "s" : ""}` },
    { key: "rating", title: "Meilleures notes", rows: top("rating", (item) => Number(item.totals.rating) || 0, (item) => item.totals.appearances >= 3), format: (value) => value.toFixed(2) },
  ];
}
