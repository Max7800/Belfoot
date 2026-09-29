import { getProvider } from "./providers";
import { seasonLabel } from "./season";

function coverageFlags(competition) {
  const fixtures = competition.ext?.coverage?.fixtures || {};
  return {
    lineups: fixtures.lineups !== false,
    playerStats: fixtures.statistics_players !== false,
    teamStats: fixtures.statistics_fixtures !== false,
  };
}

export async function syncLineups(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchMatchLineups && !provider?.fetchMatchPlayerStats && !provider?.fetchMatchTeamStats) return `${competition.name}: données de match non supportées`;

  const coverage = coverageFlags(competition);
  const canLineups = coverage.lineups && !!provider.fetchMatchLineups;
  const canStats = coverage.playerStats && !!provider.fetchMatchPlayerStats;
  const canTeamStats = coverage.teamStats && !!provider.fetchMatchTeamStats;
  if (!canLineups && !canStats && !canTeamStats) return `${competition.name}: compositions/statistiques non couvertes`;
  const selectedSeason = seasonLabel(ctx.season);
  const { data: season, error: seasonError } = await db.from("seasons").select("id").eq("competition_id", competition.id).eq("label", selectedSeason).maybeSingle();
  if (seasonError) throw seasonError;
  if (!season) return `${competition.name}: saison ${selectedSeason} introuvable`;

  // Les trois endpoints de détail partent en parallèle, mais certains matchs
  // internationaux répondent plus lentement. Deux matchs par fonction gardent
  // une marge sous les 60 s de Vercel Hobby ; le pipeline reprend ensuite le lot suivant.
  const cap = Math.max(1, Math.min(Number(ctx.matchCap) || 2, 2));
  const providerCtx = {
    ...ctx,
    providerTimeoutMs: Number(ctx.providerTimeoutMs) || 20000,
    providerAttempts: Number(ctx.providerAttempts) || 1,
  };
  const { data: candidates, error: matchesError } = await db.from("matches")
    .select("id,external_id,competition_id,status,kickoff,home_club_id,away_club_id,lineups_synced_at,player_stats_synced_at,team_stats_synced_at")
    .eq("competition_id", competition.id)
    .eq("season_id", season.id)
    .in("status", ctx.drain ? ["finished"] : ["finished", "live"])
    .not("external_id", "is", null)
    .order("kickoff", { ascending: false })
    .limit(500);
  if (matchesError) throw matchesError;

  if (!candidates?.length) return ctx.drain
    ? { detail: `${competition.name}: aucun match éligible`, complete: true, progress: { current: 0, total: 0, unit: "matchs détaillés" } }
    : `${competition.name}: aucun match éligible`;
  const [clubRows, playerRows, unresolvedRows] = await Promise.all([
    db.from("clubs").select("id,external_id,team_type").eq("source", competition.provider),
    db.from("players").select("id,external_id").eq("source", competition.provider),
    db.from("match_player_stats").select("id,match_id,club_id,player_external_id,player_name,number,position,starter,minutes,ext,locked").eq("competition_id", competition.id).is("player_id", null),
  ]);
  if (clubRows.error) throw clubRows.error;
  if (playerRows.error) throw playerRows.error;
  if (unresolvedRows.error) throw unresolvedRows.error;
  const clubMap = Object.fromEntries((clubRows.data || []).map((club) => [club.external_id, club.id]));
  const nationalTeamIds = new Set((clubRows.data || []).filter((club) => club.team_type === "national").map((club) => club.id));
  const playerMap = Object.fromEntries((playerRows.data || []).map((player) => [player.external_id, player.id]));
  let relinked = 0;
  let materialized = 0;
  for (const row of unresolvedRows.data || []) {
    if (row.locked) continue;
    let playerId = playerMap[row.player_external_id];
    // Les endpoints de composition connaissent parfois un international avant
    // qu'il n'existe dans `players`. On crée alors une fiche minimale à partir
    // du payload déjà stocké : aucun appel provider supplémentaire et aucune
    // sélection actuelle copiée sur un ancien match.
    if (!playerId && row.player_external_id && row.club_id && nationalTeamIds.has(row.club_id)) {
      const photoUrl = row.ext?.player?.photo || row.ext?.photo || null;
      const insertPayload = {
        source: competition.provider,
        external_id: row.player_external_id,
        name: row.player_name || `Joueur ${row.player_external_id}`,
        position: row.position || null,
        photo_url: photoUrl,
        active: true,
        tracked: false,
        synced_at: new Date().toISOString(),
        ext: { created_from: "national_match_callup", match_id: row.match_id },
      };
      const { data: inserted, error: insertError } = await db.from("players").insert(insertPayload).select("id").single();
      if (insertError?.code === "23505") {
        const { data: existing, error: existingError } = await db.from("players").select("id").eq("source", competition.provider).eq("external_id", row.player_external_id).maybeSingle();
        if (existingError) throw existingError;
        playerId = existing?.id || null;
      } else if (insertError) throw insertError;
      else {
        playerId = inserted?.id || null;
        materialized++;
      }
      if (playerId) playerMap[row.player_external_id] = playerId;
    }
    if (!playerId) continue;
    const { error } = await db.from("match_player_stats").update({ player_id: playerId }).eq("id", row.id).eq("locked", false);
    if (error) throw error;
    if (row.club_id && nationalTeamIds.has(row.club_id)) {
      const callupStatus = row.starter ? "started" : (Number(row.minutes) > 0 ? "played" : "bench");
      const { error: callupError } = await db.from("national_match_callups").upsert({
        match_id: row.match_id,
        national_team_id: row.club_id,
        player_id: playerId,
        status: callupStatus,
        shirt_number: row.number,
        position: row.position,
        source: competition.provider,
        external_id: row.player_external_id,
        ext: row.ext || {},
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "match_id,player_id", ignoreDuplicates: true });
      if (callupError) throw callupError;
    }
    relinked++;
  }
  const eligible = (candidates || []).filter((match) => match.status === "live"
    || (canLineups && !match.lineups_synced_at)
    || (canStats && !match.player_stats_synced_at)
    || (canTeamStats && !match.team_stats_synced_at));
  const todo = eligible.slice(0, cap);
  if (!todo.length) {
    const detail = `${competition.name}: compositions déjà à jour${relinked ? `, ${relinked} joueurs reliés` : ""}${materialized ? `, ${materialized} fiches historiques créées` : ""}`;
    return ctx.drain ? { detail, complete: true, progress: { current: 0, total: 0, unit: "matchs détaillés" } } : detail;
  }

  let teams = 0;
  let players = 0;
  let collectiveStats = 0;
  for (const match of todo) {
    const fetchLineups = canLineups && (match.status === "live" || !match.lineups_synced_at);
    const fetchStats = canStats && (match.status === "live" || !match.player_stats_synced_at);
    const fetchTeamStats = canTeamStats && (match.status === "live" || !match.team_stats_synced_at);
    const results = await Promise.allSettled([
      fetchLineups ? provider.fetchMatchLineups({ external_id: match.external_id }, providerCtx) : Promise.resolve([]),
      fetchStats ? provider.fetchMatchPlayerStats({ external_id: match.external_id }, providerCtx) : Promise.resolve([]),
      fetchTeamStats ? provider.fetchMatchTeamStats({ external_id: match.external_id }, providerCtx) : Promise.resolve([]),
    ]);
    const [lineupResult, playerResult, teamResult] = results;
    const lineups = lineupResult.status === "fulfilled" ? lineupResult.value : [];
    const stats = playerResult.status === "fulfilled" ? playerResult.value : [];
    const teamStats = teamResult.status === "fulfilled" ? teamResult.value : [];
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
    if (fetchTeamStats && teamResult.status === "fulfilled") {
      const rows = teamStats.map((row) => ({
        ...row,
        club_id: clubMap[row.team_ext] || null,
        team_ext: undefined,
      })).filter((row) => row.club_id);
      const { data: replaced, error: teamStatsError } = await db.rpc("replace_provider_match_team_stats", {
        target_match_id: match.id,
        target_competition_id: competition.id,
        target_source: competition.provider,
        stat_rows: rows,
        target_synced_at: now,
        mark_complete: match.status === "finished",
      });
      if (teamStatsError) throw teamStatsError;
      collectiveStats += Number(replaced) || 0;
    }
    if (match.status === "finished") {
      const syncState = {};
      if (fetchLineups && lineupResult.status === "fulfilled") syncState.lineups_synced_at = now;
      if (fetchStats && playerResult.status === "fulfilled") syncState.player_stats_synced_at = now;
      if (fetchTeamStats && teamResult.status === "fulfilled") syncState.team_stats_synced_at = now;
      const { error: syncStateError } = await db.from("matches").update(syncState).eq("id", match.id);
      if (syncStateError) throw syncStateError;
    }
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
  }
  const detail = `${competition.name}: ${todo.length} matchs, ${teams} formations, ${players} joueurs, ${collectiveStats} lignes collectives${relinked ? `, ${relinked} reliés` : ""}${materialized ? `, ${materialized} fiches historiques créées` : ""}`;
  if (!ctx.drain) return detail;
  const total = Number(ctx.resumeState?.total) || eligible.length;
  const remaining = Math.max(0, eligible.length - todo.length);
  await ctx.saveCheckpoint?.({ total });
  return {
    detail: `${detail} · ${remaining} match(s) restant(s)`,
    complete: remaining === 0,
    progress: { current: Math.max(0, total - remaining), total, unit: "matchs détaillés" },
  };
}
