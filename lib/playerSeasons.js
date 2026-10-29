// Fiche joueur : statistiques regroupées par saison (« Toutes les compétitions et
// saisons » était une seule table mêlant Pro League 2026-2027, Ligue Europa,
// Nations League 2026…, jugée brouillonne le 28/10/2026). Une saison = l'année de
// début : la Nations League « 2026 » rejoint 2026-2027.
const startYear = (value) => Number((String(value ?? "").match(/\d{4}/) || [0])[0]);

// Matchs amicaux (« Friendlies Clubs », préparation) : affichés, hors du total de la saison.
export const isFriendlyCompetition = (competition) => /friendl|amical/i.test(competition?.name || "");

export function groupStatsBySeason(stats = [], competitionsById = {}) {
  const seasons = new Map();
  for (const row of stats) {
    const year = startYear(row.season);
    if (!year) continue;
    const season = seasons.get(year) || { year, label: `${year}-${year + 1}`, rows: [], totals: { appearances: 0, lineups: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, rating: null }, _weight: 0, _total: 0 };
    season.rows.push(row);
    // Doublon probable de la source : affiché, mais hors du total de la saison.
    if (row.duplicateOf || isFriendlyCompetition(competitionsById[row.competition_id])) { seasons.set(year, season); continue; }
    const appearances = Number(row.appearances) || 0;
    for (const key of ["appearances", "lineups", "minutes", "goals", "assists", "yellow", "red"]) season.totals[key] += Number(row[key]) || 0;
    const rating = Number(row.rating);
    if (rating > 0 && appearances > 0) { season._total += rating * appearances; season._weight += appearances; }
    season.totals.rating = season._weight ? season._total / season._weight : null;
    seasons.set(year, season);
  }
  // Saison vide (ni match ni minute, ex. effectif sans temps de jeu) : n'apporte rien, écartée.
  return [...seasons.values()]
    .filter((season) => season.totals.appearances > 0 || season.totals.minutes > 0)
    .sort((a, b) => b.year - a.year)
    .map((season) => ({ year: season.year, label: season.label, totals: season.totals, rows: [...season.rows].sort((a, b) => (Number(b.appearances) || 0) - (Number(a.appearances) || 0)) }));
}

// Couleur d'un pourcentage selon la mesure (anneaux du widget) : vert = bon,
// ambre = moyen, rose = faible. Les anneaux étaient tous rouge Belfoot : 85 %
// de passes réussies avait l'air aussi alarmant que 30 %.
export const SHARE_THRESHOLDS = { passes: [85, 75], duels: [55, 45], dribbles: [60, 45], shots: [50, 35] };
export const SHARE_TONES = { good: "#34d399", fair: "#fbbf24", low: "#fb7185", none: "rgba(255,255,255,0.2)" };

export function shareTone(metric, value) {
  if (value == null || !Number.isFinite(Number(value))) return SHARE_TONES.none;
  const [good, fair] = SHARE_THRESHOLDS[metric] || [70, 50];
  return Number(value) >= good ? SHARE_TONES.good : Number(value) >= fair ? SHARE_TONES.fair : SHARE_TONES.low;
}

// Lignes en double venues de la source (API-Football), relevées le 29/10/2026 sur
// les 5 793 lignes des Belges suivis :
//  1. copie d'un championnat sur une coupe ou des matchs amicaux : chiffres
//     identiques au match près (A. Engels : Premiership, FA Cup et League Cup à
//     35 matchs, 2 135 min, 9 buts, 6 passes) — 178 lignes chez 97 joueurs. Deux
//     championnats identiques restent (M. Svilar, 38 matchs complets deux saisons) ;
//  2. même championnat, même saison, deux clubs au nombre de matchs voisin
//     (A. Bertaccini : 33 + 33 en Pro League 2024-2025) — 30 cas : on ne sait pas
//     lequel est juste ; les deux lignes restent affichées, seule la plus jouée
//     compte dans le total de la saison (`duplicateOf` sur l'autre).
const CUP_NAME = /(cup|coupe|beker|pokal|copa|coppa|taça|friendl|amical)/i;
const isLeagueCompetition = (competition) => String(competition?.competition_type || "").toLowerCase() === "league" && !CUP_NAME.test(competition?.name || "");
const figures = (row) => ["appearances", "minutes", "goals", "assists"].map((key) => Number(row[key]) || 0).join("|");

export function dedupeSeasonStats(stats = [], competitionsById = {}) {
  const leagueFigures = new Set(stats.filter((row) => isLeagueCompetition(competitionsById[row.competition_id]) && Number(row.appearances) >= 3).map(figures));
  const kept = stats.filter((row) => isLeagueCompetition(competitionsById[row.competition_id]) || !leagueFigures.has(figures(row)));
  const groups = new Map();
  for (const row of kept) {
    const key = `${row.competition_id}|${startYear(row.season)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const duplicateOf = new Map();
  for (const rows of groups.values()) {
    // Le plus joué fait foi ; à matchs égaux, le plus de minutes (A. Bertaccini 2024-2025 :
    // 33 matchs des deux côtés, 2 765 min à Saint-Trond où il jouait encore en 2025-2026).
    const [top, ...others] = [...rows].sort((a, b) => (Number(b.appearances) || 0) - (Number(a.appearances) || 0) || (Number(b.minutes) || 0) - (Number(a.minutes) || 0));
    const topApps = Number(top.appearances) || 0;
    for (const row of others) {
      const apps = Number(row.appearances) || 0;
      if (row.club_id !== top.club_id && topApps >= 10 && apps >= 10 && apps >= topApps * 0.75) duplicateOf.set(row.id, top.id);
    }
  }
  return kept.map((row) => (duplicateOf.has(row.id) ? { ...row, duplicateOf: duplicateOf.get(row.id) } : row));
}

// Détail d'une saison à l'écran : clubs de la saison (logo dans l'en-tête, le
// plus joué d'abord), compétitions du club puis de la sélection, lignes vides
// (ni match ni minute, ex. « Friendlies 0 match ») retirées.
export function seasonDisplay(rows = [], clubsById = {}) {
  const visible = rows.filter((row) => (Number(row.appearances) || 0) > 0 || (Number(row.minutes) || 0) > 0);
  const isNational = (row) => clubsById[row.club_id]?.team_type === "national";
  const clubApps = new Map();
  for (const row of visible) {
    if (isNational(row) || row.duplicateOf || !row.club_id) continue;
    clubApps.set(row.club_id, (clubApps.get(row.club_id) || 0) + (Number(row.appearances) || 0));
  }
  return {
    clubIds: [...clubApps.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
    clubRows: visible.filter((row) => !isNational(row)),
    nationalRows: visible.filter(isNational),
  };
}
