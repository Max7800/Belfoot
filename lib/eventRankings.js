// Classements indicatifs fondés uniquement sur les événements enregistrés.
// L'identité reste le nom fournisseur + équipe, jamais une fiche supposée.
export function eventRankings(events = []) {
  const scorers = new Map(); const assists = new Map();
  const add = (map, name, clubId) => {
    const clean = String(name || "").trim().replace(/\s+/g, " ");
    if (!clean || !clubId) return;
    const key = `${clubId}:${clean.toLocaleLowerCase("fr")}`;
    const row = map.get(key) || { key, name: clean, clubId, total: 0 };
    row.total += 1; map.set(key, row);
  };
  for (const event of events) {
    if (event.type !== "goal" || /own goal|contre.son.camp/i.test(event.detail || "")) continue;
    add(scorers, event.player_name, event.club_id);
    add(assists, event.assist_name, event.club_id);
  }
  const sorted = (map) => [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr")).slice(0, 10);
  return { scorers: sorted(scorers), assists: sorted(assists) };
}
