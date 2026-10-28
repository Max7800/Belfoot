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
