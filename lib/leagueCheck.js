// Synthèse lisible du diagnostic « Vérifier une compétition » (job
// football.league-check) : saisons réellement exposées par API-Football,
// couverture des classements, groupes d'une saison et saisons Belfoot en base.
// Aucune écriture : le texte est le seul résultat (détail du job).

const day = (value) => String(value || "").slice(0, 10) || "?";

export function summarizeLeagueCheck({ competition = {}, league = null, standingsYear = null, standings = null, belfootSeasons = [] } = {}) {
  const parts = [];
  const name = league?.name || competition.name || "Compétition";
  parts.push(`${name} (API ${competition.external_id || "?"}${league?.type ? `, ${league.type}` : ""})`);

  const apiSeasons = [...(league?.seasons || [])].sort((a, b) => Number(a.year) - Number(b.year));
  parts.push(apiSeasons.length
    ? `saisons API : ${apiSeasons.map((season) => `${season.year} [${day(season.start)} → ${day(season.end)}${season.current ? ", en cours" : ""}, classements ${season.coverage?.standings ? "oui" : "non"}]`).join(" · ")}`
    : "saisons API : aucune");

  if (standingsYear) {
    const groups = Array.isArray(standings) ? standings.filter((rows) => Array.isArray(rows) && rows.length) : [];
    const labels = groups.map((rows) => rows[0]?.group || "?");
    parts.push(groups.length
      ? `classement ${standingsYear} : ${groups.length} groupe(s), ${groups.reduce((sum, rows) => sum + rows.length, 0)} ligne(s) (${labels.join(", ")})`
      : `classement ${standingsYear} : aucun`);
  }

  const seasons = [...belfootSeasons].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  parts.push(seasons.length
    ? `Belfoot : ${seasons.map((season) => `${season.label} ${season.public_active ? "active" : season.import_status || "?"} ${season.matches ?? "?"} match(s)`).join(" · ")}`
    : "Belfoot : aucune saison");

  parts.push("aucune écriture sportive");
  return parts.join(" · ");
}

// Année API demandée explicitement (jamais l'année civile par défaut).
export function requestedApiYear(season) {
  return String(season || "").match(/\b(19|20)\d{2}\b/)?.[0] || null;
}
