const CUP_PHASE = /(^|\b)(round of \d+|\d+(st|nd|rd|th) round|quarter[ -]?finals?|semi[ -]?finals?|finals?|huiti[eè]mes?|quarts?|demi-finales?|finale)\b/i;
const LEAGUE_PHASE = /(regular season|championship round|relegation round|play-?off group)/i;

// competition_type reste le choix éditorial de référence. Les indices provider/rounds
// servent de filet de sécurité pour les anciennes lignes créées avant l'ajout du champ.
export function getCompetitionType(competition, matches = []) {
  const declared = String(competition?.competition_type || "").toLowerCase();
  const providerType = String(
    competition?.ext?.providerType || competition?.ext?.provider_type || competition?.ext?.type || ""
  ).toLowerCase();

  if (declared === "cup" || providerType === "cup") return "cup";
  if (providerType === "league") return "league";

  const phases = [...new Set(matches.map((m) => m.phase || m.round_raw).filter(Boolean))];
  const cupSignals = phases.filter((p) => CUP_PHASE.test(p)).length;
  const leagueSignals = phases.filter((p) => LEAGUE_PHASE.test(p)).length;
  if (cupSignals >= 2 && cupSignals > leagueSignals) return "cup";

  return declared === "cup" ? "cup" : "league";
}

export function competitionPhases(matches = [], type = "league") {
  const grouped = new Map();
  for (const match of matches) {
    const phase = match.phase || "—";
    const item = grouped.get(phase) || { phase, count: 0, first: null, last: null };
    const kickoff = match.kickoff ? new Date(match.kickoff).getTime() : null;
    item.count++;
    if (kickoff != null && !Number.isNaN(kickoff)) {
      item.first = item.first == null ? kickoff : Math.min(item.first, kickoff);
      item.last = item.last == null ? kickoff : Math.max(item.last, kickoff);
    }
    grouped.set(phase, item);
  }

  const rows = [...grouped.values()];
  if (type === "cup") {
    return rows.sort((a, b) => (a.first ?? Infinity) - (b.first ?? Infinity)).map((x) => x.phase);
  }
  return rows.sort((a, b) => b.count - a.count).map((x) => x.phase);
}
