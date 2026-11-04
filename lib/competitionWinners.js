// Données éditoriales confirmées : aucune déduction depuis un classement partiel.
export function validateCompetitionWinners(rows) {
  if (!Array.isArray(rows)) return "La liste des vainqueurs est invalide.";
  const seen = new Set();
  for (const row of rows) {
    const season = typeof row?.season === "string" ? row.season.trim() : "";
    const winner = typeof row?.winner === "string" ? row.winner.trim() : "";
    const match = /^(\d{4})(?:-(\d{4}))?$/.exec(season);
    if (!match || (match[2] && Number(match[2]) !== Number(match[1]) + 1)) return "Indique une saison complète, par exemple 2025-2026 ou 2026.";
    if (!winner) return `Indique le vainqueur pour ${season}.`;
    if (seen.has(season)) return `La saison ${season} est présente plusieurs fois.`;
    seen.add(season);
    if (row.source && typeof row.source !== "string") return `Le lien source de ${season} est invalide.`;
    if (row.source) {
      try { const url = new URL(row.source); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); }
      catch { return `Le lien source de ${season} doit commencer par http:// ou https://.`; }
    }
  }
  return null;
}

export function recentCompetitionWinners(rows, limit = 5) {
  if (!Array.isArray(rows)) return [];
  const valid = rows.filter((row) => !validateCompetitionWinners([row]));
  const counts = new Map();
  for (const row of valid) counts.set(row.season.trim(), (counts.get(row.season.trim()) || 0) + 1);
  return valid.filter((row) => counts.get(row.season.trim()) === 1)
    .slice().sort((a, b) => Number(b.season.trim().slice(0, 4)) - Number(a.season.trim().slice(0, 4)))
    .slice(0, limit);
}
