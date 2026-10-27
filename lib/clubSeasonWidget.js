// Saison d'une équipe dans une compétition (esprit widget équipe API-Sports),
// calculée depuis les matchs terminés, leurs faits (match_events), les
// compositions (match_lineups) et les statistiques collectives (match_team_stats).
export const PERIODS = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90", "91-120"];
const periodOf = (minute) => {
  // Minute inconnue (null) : Number(null) vaudrait 0, le fait serait compté en début de match.
  const value = minute == null || minute === "" ? NaN : Number(minute);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value <= 15) return 0; if (value <= 30) return 1; if (value <= 45) return 2;
  if (value <= 60) return 3; if (value <= 75) return 4; if (value <= 90) return 5;
  return 6;
};
const emptyRecord = () => ({ played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
const kickoff = (match) => Date.parse(match?.kickoff || "") || 0;

export function summarizeClubSeason({ clubId, matches = [], events = [], lineups = [], teamStats = [] } = {}) {
  const played = matches
    .filter((match) => match.status === "finished" && match.home_score != null && match.away_score != null && (match.home_club_id === clubId || match.away_club_id === clubId))
    .sort((a, b) => kickoff(a) - kickoff(b));
  if (!played.length) return null;
  const home = emptyRecord(); const away = emptyRecord();
  let cleanSheets = 0; let failedToScore = 0; let biggestWin = null; let biggestLoss = null;
  const form = [];
  for (const match of played) {
    const isHome = match.home_club_id === clubId;
    const goalsFor = Number(isHome ? match.home_score : match.away_score);
    const goalsAgainst = Number(isHome ? match.away_score : match.home_score);
    const record = isHome ? home : away;
    record.played++; record.goalsFor += goalsFor; record.goalsAgainst += goalsAgainst;
    const result = goalsFor > goalsAgainst ? "V" : goalsFor < goalsAgainst ? "D" : "N";
    if (result === "V") record.wins++; else if (result === "D") record.losses++; else record.draws++;
    form.push({ result, match });
    if (goalsAgainst === 0) cleanSheets++;
    if (goalsFor === 0) failedToScore++;
    const margin = goalsFor - goalsAgainst;
    if (margin > 0 && (!biggestWin || margin > biggestWin.margin || (margin === biggestWin.margin && goalsFor > biggestWin.goalsFor))) biggestWin = { match, margin, goalsFor, goalsAgainst };
    if (margin < 0 && (!biggestLoss || margin < biggestLoss.margin || (margin === biggestLoss.margin && goalsAgainst > biggestLoss.goalsAgainst))) biggestLoss = { match, margin, goalsFor, goalsAgainst };
  }
  const total = Object.fromEntries(Object.keys(home).map((key) => [key, home[key] + away[key]]));

  // Faits par tranche de 15 minutes (buts marqués / encaissés, cartons du club).
  const matchIds = new Set(played.map((match) => match.id));
  const goalsByPeriod = PERIODS.map(() => ({ scored: 0, conceded: 0 }));
  const cardsByPeriod = PERIODS.map(() => ({ yellow: 0, red: 0 }));
  for (const event of events) {
    if (!matchIds.has(event.match_id)) continue;
    const period = periodOf(event.minute);
    if (period == null) continue;
    const own = event.club_id === clubId;
    if (event.type === "goal" && !/missed penalty/i.test(event.detail || "")) {
      // L'API attribue un but contre son camp à l'équipe qui en profite (vérifié
      // le 27/10/2026 : les buts comptés par équipe redonnent le score exact).
      if (own) goalsByPeriod[period].scored++; else goalsByPeriod[period].conceded++;
    } else if (own && (event.type === "yellow" || event.type === "red")) cardsByPeriod[period][event.type]++;
  }

  // Formations les plus utilisées.
  const formationCounts = new Map();
  for (const lineup of lineups) {
    if (lineup.club_id !== clubId || !matchIds.has(lineup.match_id) || !lineup.formation) continue;
    formationCounts.set(lineup.formation, (formationCounts.get(lineup.formation) || 0) + 1);
  }
  const lineupTotal = [...formationCounts.values()].reduce((sum, count) => sum + count, 0);
  const formations = [...formationCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([formation, count]) => ({ formation, count, share: Math.round((count / lineupTotal) * 100) }));

  const ownStats = teamStats.filter((row) => row.club_id === clubId && matchIds.has(row.match_id));
  const average = (field) => {
    const values = ownStats.map((row) => (row[field] == null ? NaN : Number(row[field]))).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };

  return {
    played: total.played, home, away, total,
    winShare: Math.round((total.wins / total.played) * 100),
    cleanSheets, failedToScore,
    cleanSheetShare: Math.round((cleanSheets / total.played) * 100),
    averageFor: total.goalsFor / total.played,
    averageAgainst: total.goalsAgainst / total.played,
    form: form.slice(-5).reverse(),
    biggestWin, biggestLoss,
    goalsByPeriod, cardsByPeriod, formations,
    possession: average("possession"), shots: average("shots_total"), shotsOnGoal: average("shots_on_goal"),
    detailedMatches: ownStats.length,
  };
}
