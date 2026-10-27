// Statistiques de saison d'un joueur, compétition par compétition (esprit
// widget API-Sports) : totaux de la saison (player_season_stats), puis détail
// agrégé depuis les performances de match importées en « Saison complète »
// (match_player_stats.ext = ligne /fixtures/players de l'API : tirs, passes,
// duels, dribbles, tacles, fautes…).
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const sum = (rows, pick) => rows.reduce((total, row) => total + num(pick(row)), 0);

// Une ligne par compétition, la plus jouée d'abord.
export function competitionTabs(stats = []) {
  const byCompetition = new Map();
  for (const row of stats) {
    if (!row.competition_id) continue;
    const list = byCompetition.get(row.competition_id) || [];
    list.push(row);
    byCompetition.set(row.competition_id, list);
  }
  return [...byCompetition.entries()]
    .map(([competitionId, rows]) => {
      const rated = rows.filter((row) => num(row.rating) > 0);
      const weight = sum(rated, (row) => Math.max(1, num(row.appearances)));
      return {
        competitionId,
        clubIds: [...new Set(rows.map((row) => row.club_id).filter(Boolean))],
        seasons: [...new Set(rows.map((row) => row.season).filter(Boolean))],
        appearances: sum(rows, (row) => row.appearances),
        lineups: sum(rows, (row) => row.lineups),
        minutes: sum(rows, (row) => row.minutes),
        goals: sum(rows, (row) => row.goals),
        assists: sum(rows, (row) => row.assists),
        yellow: sum(rows, (row) => row.yellow),
        red: sum(rows, (row) => row.red),
        // Note de saison de l'API (sur tous les matchs), pondérée par les matchs.
        rating: weight ? rated.reduce((total, row) => total + num(row.rating) * Math.max(1, num(row.appearances)), 0) / weight : null,
      };
    })
    .sort((a, b) => b.appearances - a.appearances || b.minutes - a.minutes);
}

// Détail agrégé des matchs détaillés d'une compétition.
// NB : dans /fixtures/players, `passes.accuracy` est le NOMBRE de passes
// réussies du match (et non un pourcentage).
export function matchDetails(performances = []) {
  const stats = performances.map((row) => row?.ext?.statistics?.[0]).filter(Boolean);
  if (!stats.length) return null;
  const s = (pick) => sum(stats, pick);
  return {
    matches: stats.length,
    shots: { total: s((x) => x.shots?.total), on: s((x) => x.shots?.on) },
    passes: { total: s((x) => x.passes?.total), accurate: s((x) => x.passes?.accuracy), key: s((x) => x.passes?.key) },
    duels: { total: s((x) => x.duels?.total), won: s((x) => x.duels?.won) },
    dribbles: { attempts: s((x) => x.dribbles?.attempts), success: s((x) => x.dribbles?.success) },
    defence: { tackles: s((x) => x.tackles?.total), interceptions: s((x) => x.tackles?.interceptions), blocks: s((x) => x.tackles?.blocks) },
    fouls: { drawn: s((x) => x.fouls?.drawn), committed: s((x) => x.fouls?.committed) },
    goalkeeper: { saves: s((x) => x.goals?.saves), conceded: s((x) => x.goals?.conceded) },
    penalties: { scored: s((x) => x.penalty?.scored), missed: s((x) => x.penalty?.missed) },
  };
}

// Part en pourcentage (arrondie), null si rien à mesurer.
export const share = (part, whole) => (num(whole) > 0 ? Math.round((num(part) / num(whole)) * 100) : null);

// Saison affichée : « 2026-2027 » pour une compétition de clubs (l'API stocke
// « 2026 »), année seule pour une compétition de sélections (année civile).
export function displaySeason(season, competition) {
  const text = String(season ?? "").trim();
  if (!/^\d{4}$/.test(text) || competition?.competition_scope === "international") return text;
  return `${text}-${Number(text) + 1}`;
}
