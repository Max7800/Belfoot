// Proximité du rassemblement : on privilégie une compétition active ou imminente,
// puis la dernière jouée. Le classement ne dépend pas de l'ordre d'arrivée SQL.
export function competitionRecency(matches = [], now = Date.now()) {
  const dates = matches.map((match) => Date.parse(match.kickoff || "")).filter(Number.isFinite);
  const past = dates.filter((date) => date <= now).sort((a, b) => b - a)[0] ?? null;
  const future = dates.filter((date) => date > now).sort((a, b) => a - b)[0] ?? null;
  const active = (past !== null && now - past <= 21 * 86400000) || (future !== null && future - now <= 21 * 86400000);
  return { active, past, future };
}

export function sortNationalCompetitions(tables = [], now = Date.now()) {
  return [...tables].sort((a, b) => {
    const x = competitionRecency(a.matches, now); const y = competitionRecency(b.matches, now);
    if (x.active !== y.active) return x.active ? -1 : 1;
    if (x.active && y.active) {
      const dx = Math.min(x.past === null ? Infinity : now - x.past, x.future === null ? Infinity : x.future - now);
      const dy = Math.min(y.past === null ? Infinity : now - y.past, y.future === null ? Infinity : y.future - now);
      if (dx !== dy) return dx - dy;
    }
    return (y.past ?? -Infinity) - (x.past ?? -Infinity) || (x.future ?? Infinity) - (y.future ?? Infinity) || String(a.compId).localeCompare(String(b.compId));
  });
}

// La compétition du dernier résultat apparaît d'abord si elle possède un groupe.
export function prioritizeResultCompetition(tables = [], competitionId, now = Date.now()) {
  const ordered = sortNationalCompetitions(tables, now);
  const index = ordered.findIndex((table) => table.compId === competitionId);
  if (index > 0) ordered.unshift(ordered.splice(index, 1)[0]);
  return ordered;
}
