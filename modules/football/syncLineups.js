import { getProvider } from "./providers";

function coverageFlags(competition) {
  const fixtures = competition.ext?.coverage?.fixtures || {};
  return {
    lineups: fixtures.lineups !== false,
    playerStats: fixtures.statistics_players !== false,
  };
}

export async function syncLineups(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchMatchLineups && !provider?.fetchMatchPlayerStats) return `${competition.name}: compositions non supportées`;

  const coverage = coverageFlags(competition);
  const canLineups = coverage.lineups && !!provider.fetchMatchLineups;
  const canStats = coverage.playerStats && !!provider.fetchMatchPlayerStats;
  if (!canLineups && !canStats) return `${competition.name}: compositions/statistiques non couvertes`;

  const cap = Math.max(1, Math.min(Number(ctx.matchCap) || 3, 20));
  const { data: candidates, error: matchesError } = await db.from("matches")
    .select("id,external_id,competition_id,status,kickoff,home_club_id,away_club_id")
    .eq("competition_id", competition.id)
    .in("status", ["finished", "live"])
    .not("external_id", "is", null)
    .order("kickoff", { ascending: false })
    .limit(300);
  if (matchesError) throw matchesError;

  if (!candidates?.length) return `${competition.name}: aucun match éligible`;
  const [lineupRows, statRows, clubRows, playerRows, unresolvedRows] = await Promise.all([
    db.from("match_lineups").select("match_id").eq("competition_id", competition.id),
    db.from("match_player_stats").select("match_id,minutes").eq("competition_id", competition.id),
    db.from("clubs").select("id,external_id,team_type").eq("source", competition.provider),
    db.from("players").select("id,external_id").eq("source", competition.provider),
    db.from("match_player_stats").select("id,player_external_id").eq("competition_id", competition.id).is("player_id", null),
  ]);
  if (lineupRows.error) throw lineupRows.error;
  if (statRows.error) throw statRows.error;
  if (clubRows.error) throw clubRows.error;
  if (playerRows.error) throw playerRows.error;
  if (unresolvedRows.error) throw unresolvedRows.error;
  const clubMap = Object.fromEntries((clubRows.data || []).map((club) => [club.external_id, club.id]));
  const nationalTeamIds = new Set((clubRows.data || []).filter((club) => club.team_type === "national").map((club) => club.id));
  const playerMap = Object.fromEntries((playerRows.data || []).map((player) => [player.external_id, player.id]));
  let relinked = 0;
  for (const row of unresolvedRows.data || []) {
    const playerId = playerMap[row.player_external_id];
    if (!playerId) continue;
    const { error } = await db.from("match_player_stats").update({ player_id: playerId }).eq("id", row.id).eq("locked", false);
    if (error) throw error;
    relinked++;
  }
  const hasLineup = new Set((lineupRows.data || []).map((row) => row.match_id));
  const hasFinalStats = new Set((statRows.data || []).filter((row) => row.minutes !== null).map((row) => row.match_id));
  const todo = (candidates || []).filter((match) => canStats ? !hasFinalStats.has(match.id) : !hasLineup.has(match.id)).slice(0, cap);
  if (!todo.length) return `${competition.name}: compositions déjà à jour${relinked ? `, ${relinked} joueurs reliés` : ""}`;

  let teams = 0;
  let players = 0;
  for (const match of todo) {
    const [lineups, stats] = await Promise.all([
      canLineups ? provider.fetchMatchLineups({ external_id: match.external_id }, ctx) : Promise.resolve([]),
      canStats ? provider.fetchMatchPlayerStats({ external_id: match.external_id }, ctx) : Promise.resolve([]),
    ]);
    const now = new Date().toISOString();
    const { data: lockedLineups } = await db.from("match_lineups").select("club_id").eq("match_id", match.id).eq("locked", true);
    const lockedClubIds = new Set((lockedLineups || []).map((row) => row.club_id));
    for (const row of lineups) {
      const clubId = clubMap[row.team_ext] || null;
      if (!clubId || lockedClubIds.has(clubId)) continue;
      const { error } = await db.from("match_lineups").upsert({
        match_id: match.id,
        competition_id: competition.id,
        club_id: clubId,
        formation: row.formation || null,
        source: competition.provider,
        synced_at: now,
        ext: row.ext || {},
      }, { onConflict: "match_id,club_id" });
      if (error) throw error;
      teams++;
    }

    const merged = new Map();
    for (const row of lineups.flatMap((team) => team.players || [])) merged.set(`${row.team_ext}:${row.player_ext}`, row);
    for (const row of stats) {
      const key = `${row.team_ext}:${row.player_ext}`;
      merged.set(key, { ...(merged.get(key) || {}), ...row });
    }
    const { data: lockedPlayers } = await db.from("match_player_stats").select("player_external_id").eq("match_id", match.id).eq("locked", true);
    const lockedPlayerIds = new Set((lockedPlayers || []).map((row) => row.player_external_id));
    const { data: lockedCallups, error: lockedCallupsError } = await db.from("national_match_callups").select("player_id").eq("match_id", match.id).eq("locked", true);
    if (lockedCallupsError) throw lockedCallupsError;
    const lockedCallupPlayerIds = new Set((lockedCallups || []).map((row) => row.player_id));
    for (const row of merged.values()) {
      if (!row.player_ext || lockedPlayerIds.has(row.player_ext)) continue;
      const payload = {
        match_id: match.id,
        competition_id: competition.id,
        club_id: clubMap[row.team_ext] || null,
        player_id: playerMap[row.player_ext] || null,
        player_external_id: row.player_ext,
        player_name: row.player_name || null,
        number: row.number ?? null,
        position: row.position || null,
        grid: row.grid || null,
        starter: !!row.starter,
        substitute: row.substitute ?? !row.starter,
        captain: !!row.captain,
        minutes: row.minutes ?? null,
        rating: row.rating ?? null,
        goals: row.goals || 0,
        assists: row.assists || 0,
        saves: row.saves || 0,
        goals_conceded: row.goals_conceded ?? null,
        yellow: row.yellow || 0,
        red: row.red || 0,
        source: competition.provider,
        synced_at: now,
        ext: row.ext || {},
      };
      const { error } = await db.from("match_player_stats").upsert(payload, { onConflict: "match_id,source,player_external_id" });
      if (error) throw error;
      if (payload.club_id && payload.player_id && nationalTeamIds.has(payload.club_id) && !lockedCallupPlayerIds.has(payload.player_id)) {
        const callupStatus = payload.starter ? "started" : (Number(payload.minutes) > 0 ? "played" : "bench");
        const { error: callupError } = await db.from("national_match_callups").upsert({
          match_id: match.id,
          national_team_id: payload.club_id,
          player_id: payload.player_id,
          status: callupStatus,
          shirt_number: payload.number,
          position: payload.position,
          source: competition.provider,
          external_id: payload.player_external_id,
          ext: payload.ext,
          synced_at: now,
          updated_at: now,
        }, { onConflict: "match_id,player_id" });
        if (callupError) throw callupError;
      }
      players++;
    }
  }
  return `${competition.name}: ${todo.length} matchs, ${teams} formations, ${players} joueurs${relinked ? `, ${relinked} reliés` : ""}`;
}
