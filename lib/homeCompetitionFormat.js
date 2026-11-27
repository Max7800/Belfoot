const GROUP_PHASE = /\bgroup(?:e|s)?\b|phase de groupes/i;
const LEAGUE_PHASE = /^(?:league stage|phase de ligue)$/i;

// Une coupe peut commencer par des groupes avant les tours à élimination.
export function homeCompetitionFormat(competition, matches = []) {
  const cup = /(cup|coupe|beker|pokal)/i.test(`${competition?.name || ""} ${competition?.competition_type || ""} ${competition?.ext?.type || ""} ${competition?.ext?.providerType || ""}`);
  const groupPhases = new Map();
  const leaguePhases = new Map();
  for (const match of matches) {
    const phase = String(match.phase || match.round_raw || "").trim();
    if (GROUP_PHASE.test(phase)) groupPhases.set(phase, (groupPhases.get(phase) || 0) + 1);
    if (LEAGUE_PHASE.test(phase)) leaguePhases.set(phase, (leaguePhases.get(phase) || 0) + 1);
  }
  const groupPhase = [...groupPhases].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const leaguePhase = [...leaguePhases].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { cup, groupPhase, leaguePhase, knockout: cup && !groupPhase && !leaguePhase };
}
