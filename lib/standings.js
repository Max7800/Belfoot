export function computeStandings(ms) {
  const t = {};
  for (const m of ms) {
    if (!m.home_club_id || !m.away_club_id || m.home_score == null) continue;
    for (const [c, gf, ga] of [[m.home_club_id, m.home_score, m.away_score], [m.away_club_id, m.away_score, m.home_score]]) {
      let r = t[c]; if (!r) r = t[c] = { club: c, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 };
      r.played++; r.gf += gf; r.ga += ga;
      if (gf > ga) { r.won++; r.pts += 3; } else if (gf === ga) { r.drawn++; r.pts++; } else r.lost++;
    }
  }
  return Object.values(t).map((r) => ({ ...r, gd: r.gf - r.ga })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}
