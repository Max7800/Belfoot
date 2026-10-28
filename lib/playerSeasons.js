// Fiche joueur : statistiques regroupées par saison (« Toutes les compétitions et
// saisons » était une seule table mêlant Pro League 2026-2027, Ligue Europa,
// Nations League 2026…, jugée brouillonne le 28/10/2026). Une saison = l'année de
// début : la Nations League « 2026 » rejoint 2026-2027.
const startYear = (value) => Number((String(value ?? "").match(/\d{4}/) || [0])[0]);

export function groupStatsBySeason(stats = []) {
  const seasons = new Map();
  for (const row of stats) {
    const year = startYear(row.season);
    if (!year) continue;
    const season = seasons.get(year) || { year, label: `${year}-${year + 1}`, rows: [], totals: { appearances: 0, lineups: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, rating: null }, _weight: 0, _total: 0 };
    season.rows.push(row);
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
