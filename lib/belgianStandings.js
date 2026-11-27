// Départage des saisons régulières belges 2026-2027 uniquement. Les tours
// finaux et les autres éditions peuvent suivre d'autres règles.
export function rankBelgianStandings(rows, matches, competition, seasonLabel, phase) {
  const leagueId = String(competition?.external_id || "");
  if (competition?.provider !== "apifootball" || !["144", "145"].includes(leagueId)
      || !/^2026(?:-2027)?$/.test(String(seasonLabel || ""))
      || !/^(regular season|saison régulière)$/i.test(String(phase || "").trim())) return rows;

  const away = new Map();
  for (const match of matches) {
    if (!match.away_club_id || match.home_score == null || match.away_score == null) continue;
    const current = away.get(match.away_club_id) || { wins: 0, gd: 0, goals: 0 };
    current.wins += Number(match.away_score > match.home_score);
    current.gd += match.away_score - match.home_score;
    current.goals += Number(match.away_score);
    away.set(match.away_club_id, current);
  }
  return [...rows].sort((a, b) => {
    const basic = b.pts - a.pts || b.won - a.won || b.gd - a.gd || b.gf - a.gf;
    if (basic || leagueId !== "144") return basic;
    const x = away.get(a.club) || { wins: 0, gd: 0, goals: 0 };
    const y = away.get(b.club) || { wins: 0, gd: 0, goals: 0 };
    return y.wins - x.wins || y.gd - x.gd || y.goals - x.goals;
  });
}
