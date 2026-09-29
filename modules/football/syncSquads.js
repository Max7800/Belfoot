import { getProvider } from "./providers";
import { clearUnassignedPlayerStats, upsertPlayerMembership } from "./playerMemberships";

async function mapWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

export async function syncSquads(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchSquadPlayers) return `${competition.name}: squad non supporté`;
  if (competition.ext?.coverage && competition.ext.coverage.players === false) return `${competition.name}: joueurs non couverts`;

  const season = (String(ctx.season ?? competition.ext?.season ?? "").match(/\d{4}/) || [])[0] || String(new Date().getFullYear());
  const { data: seasonRows, error: seasonsError } = await db.from("seasons").select("id,label").eq("competition_id", competition.id);
  if (seasonsError) throw seasonsError;
  const seasonRow = (seasonRows || []).find((row) => String(row.label || "").includes(season));
  let matchesQuery = db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
  if (seasonRow?.id) matchesQuery = matchesQuery.eq("season_id", seasonRow.id);
  const { data: ms, error: matchesError } = await matchesQuery;
  if (matchesError) throw matchesError;
  const clubIds = [...new Set((ms || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
  if (!clubIds.length) return `${competition.name}: aucun club (fais d'abord l'import)`;
  const { data: clubs, error: clubsError } = await db.from("clubs").select("id,name,external_id,team_type,parent_club_id").in("id", clubIds).order("id");
  if (clubsError) throw clubsError;

  const now = new Date().toISOString();
  let n = 0;
  const orderedClubs = clubs || [];
  const startClubIndex = Math.max(0, Number(ctx.startClubIndex) || 0);
  const defaultBatchSize = ctx.pipelineRunId ? 1 : Math.max(1, orderedClubs.length);
  const maxBatchSize = ctx.pipelineRunId ? 5 : Math.max(1, orderedClubs.length);
  const clubBatchSize = Math.max(1, Math.min(Number(ctx.clubBatchSize) || defaultBatchSize, maxBatchSize));
  const endClubIndex = Math.min(orderedClubs.length, startClubIndex + clubBatchSize);
  for (let clubIndex = startClubIndex; clubIndex < endClubIndex; clubIndex++) {
    const club = orderedClubs[clubIndex];
    const fetchedPlayers = await provider.fetchSquadPlayers({ external_id: club.external_id }, { ...ctx, season, leagueId: competition.external_id });
    const players = [...new Map((fetchedPlayers || []).filter((player) => player.external_id).map((player) => [String(player.external_id), player])).values()];
    const externalIds = players.map((player) => player.external_id);
    const { data: existingRows, error: existingRowsError } = externalIds.length
      ? await db.from("players").select("id,locked,club_id,external_id").eq("source", competition.provider).in("external_id", externalIds)
      : { data: [], error: null };
    if (existingRowsError) throw existingRowsError;
    const existingByExternalId = new Map((existingRows || []).map((player) => [String(player.external_id), player]));

    await mapWithConcurrency(players, 8, async (p) => {
      const existing = existingByExternalId.get(String(p.external_id));
      const primaryClub = !["reserve", "u23", "youth", "women"].includes(club.team_type);
      const patch = { source: competition.provider, external_id: p.external_id, name: p.name, nationality: p.nationality, position: p.position, photo_url: p.photo_url, age: p.age, birth_date: p.birth_date, club_id: primaryClub || !existing?.club_id ? club.id : existing.club_id, country: competition.ext?.country || null, competition: competition.name, synced_at: now };
      let pid = existing?.id;
      if (existing && !existing.locked) {
        const { error } = await db.from("players").update(patch).eq("id", existing.id);
        if (error) throw error;
      } else if (!existing) {
        const { data: ins, error } = await db.from("players").insert({ ...patch, active: true, tracked: false }).select("id").single();
        if (error) throw error;
        pid = ins?.id;
      }
      if (pid) await Promise.all([
        p.stats ? (async () => {
          await clearUnassignedPlayerStats(db, { playerId: pid, competitionId: competition.id, season });
          const { error } = await db.from("player_season_stats").upsert({ player_id: pid, club_id: club.id, season_id: seasonRow?.id || null, competition_id: competition.id, season, ...p.stats, source: competition.provider, external_id: p.external_id, synced_at: now }, { onConflict: "player_id,club_id,competition_id,season" });
          if (error) throw new Error(`${competition.name}: stats ${p.name}: ${error.message}`);
        })() : Promise.resolve(),
        upsertPlayerMembership(db, {
          playerId: pid,
          club,
          season,
          source: competition.provider,
          externalId: p.external_id,
          position: p.position,
          shirtNumber: p.number ?? null,
          isPrimary: primaryClub,
          ext: p.ext || {},
          syncedAt: now,
        }),
      ]);
      n++;
    });
    await ctx.saveClubCheckpoint?.(clubIndex + 1);
  }
  return {
    detail: `${competition.name}: ${n} joueurs (+ stats saison) · clubs ${endClubIndex}/${orderedClubs.length}`,
    complete: endClubIndex >= orderedClubs.length,
    progress: { current: endClubIndex, total: orderedClubs.length, unit: "clubs" },
  };
}
