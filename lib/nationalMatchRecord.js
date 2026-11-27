// Bilan des seules rencontres chargées ; un score manquant n'est pas un 0-0.
export function nationalMatchRecord(matches = [], teamId) {
  const totals = { matches: 0, wins: 0, goals: 0, scoredMatches: 0 };
  for (const match of matches) {
    if (match.status !== "finished" || !teamId || (match.home_club_id !== teamId && match.away_club_id !== teamId)) continue;
    totals.matches++;
    if (!Number.isFinite(match.home_score) || !Number.isFinite(match.away_score)) continue;
    const home = match.home_club_id === teamId;
    const mine = home ? match.home_score : match.away_score;
    const theirs = home ? match.away_score : match.home_score;
    totals.scoredMatches++;
    totals.goals += mine;
    if (mine > theirs) totals.wins++;
  }
  return totals;
}

// Le 1er janvier en Belgique est à UTC+1 ; les bornes sont exclusives en fin.
export function belgianCalendarYear(date = new Date()) {
  const year = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Brussels" }).format(date));
  return { year, from: new Date(Date.UTC(year - 1, 11, 31, 23)).toISOString(), to: new Date(Date.UTC(year, 11, 31, 23)).toISOString() };
}
