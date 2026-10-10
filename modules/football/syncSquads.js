import { getProvider } from "./providers";
import { clearUnassignedPlayerStats, upsertPlayerMembership } from "./playerMemberships";
import { loadCompetitionSeasonClubIds } from "./seasonClubs";
import { providerIdentityPatch } from "@/lib/playerIdentity";

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
  const matchClubIds = [...new Set((ms || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
  const clubIds = await loadCompetitionSeasonClubIds(db, competition, ctx.season, matchClubIds);
  if (!clubIds.length) return `${competition.name}: aucun club (fais d'abord l'import)`;
  const { data: clubs, error: clubsError } = await db.from("clubs").select("id,name,external_id,team_type,parent_club_id").in("id", clubIds).order("id");
  if (clubsError) throw clubsError;

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const currentSeasonStart = nowDate.getUTCMonth() >= 6 ? nowDate.getUTCFullYear() : nowDate.getUTCFullYear() - 1;
  const currentSeason = Number(season) === currentSeasonStart;
  let n = 0;
  const orderedClubs = clubs || [];
  const startClubIndex = Math.max(0, Number(ctx.startClubIndex) || 0);
  const defaultBatchSize = ctx.pipelineRunId ? 1 : Math.max(1, orderedClubs.length);
  const maxBatchSize = ctx.pipelineRunId ? 5 : Math.max(1, orderedClubs.length);
  const clubBatchSize = Math.max(1, Math.min(Number(ctx.clubBatchSize) || defaultBatchSize, maxBatchSize));
  const endClubIndex = Math.min(orderedClubs.length, startClubIndex + clubBatchSize);
  for (let clubIndex = startClubIndex; clubIndex < endClubIndex; clubIndex++) {
    const club = orderedClubs[clubIndex];
    const [seasonPlayers, currentPlayers] = await Promise.all([
      provider.fetchSquadPlayers({ external_id: club.external_id }, { ...ctx, season, leagueId: competition.external_id }),
      currentSeason && provider.fetchCurrentSquad
        ? provider.fetchCurrentSquad({ external_id: club.external_id }, { ...ctx, season })
        : Promise.resolve([]),
    ]);
    const seasonByExternalId = new Map((seasonPlayers || []).filter((player) => player.external_id).map((player) => [String(player.external_id), player]));
    const authoritativeCurrentSquad = currentSeason && (currentPlayers || []).length > 0;
    const rosterSource = authoritativeCurrentSquad ? currentPlayers : seasonPlayers;
    const players = [...new Map((rosterSource || []).filter((player) => player.external_id).map((player) => {
      const seasonPlayer = seasonByExternalId.get(String(player.external_id));
      return [String(player.external_id), {
        ...(seasonPlayer || {}),
        ...player,
        stats: seasonPlayer?.stats || null,
        nationality: seasonPlayer?.nationality || player.nationality || null,
        birth_date: seasonPlayer?.birth_date || player.birth_date || null,
      }];
    })).values()];
    const externalIds = players.map((player) => player.external_id);
    const { data: existingRows, error: existingRowsError } = externalIds.length
      ? await db.from("players").select("id,locked,club_id,external_id,nationality,ext").eq("source", competition.provider).in("external_id", externalIds)
      : { data: [], error: null };
    if (existingRowsError) throw existingRowsError;
    const existingByExternalId = new Map((existingRows || []).map((player) => [String(player.external_id), player]));

    if (authoritativeCurrentSquad) {
      const currentExternalIds = new Set(externalIds.map(String));
      const { data: currentMemberships, error: membershipsError } = await db.from("player_team_seasons")
        .select("id,external_id,locked")
        .eq("club_id", club.id)
        .eq("season_start_year", Number(season))
        .eq("source", competition.provider)
        .eq("active", true);
      if (membershipsError) throw membershipsError;
      const staleMembershipIds = (currentMemberships || [])
        .filter((membership) => !membership.locked && membership.external_id && !currentExternalIds.has(String(membership.external_id)))
        .map((membership) => membership.id);
      if (staleMembershipIds.length) {
        const { error } = await db.from("player_team_seasons").update({ active: false, synced_at: now, updated_at: now }).in("id", staleMembershipIds);
        if (error) throw error;
      }
    }

    await mapWithConcurrency(players, 8, async (p) => {
      const existing = existingByExternalId.get(String(p.external_id));
      const primaryClub = !["reserve", "u23", "youth", "women"].includes(club.team_type);
      // Nationalité et date de naissance : jamais effacées par une valeur absente de
      // l'API (l'effectif actuel /players/squads n'en fournit pas), jamais remplacées
      // si elles ont été fixées dans l'administration.
      const identity = providerIdentityPatch(existing, { nationality: p.nationality, birth_date: p.birth_date });
      const patch = { source: competition.provider, external_id: p.external_id, name: p.name, ...identity, position: p.position, photo_url: p.photo_url, age: p.age, club_id: primaryClub || !existing?.club_id ? club.id : existing.club_id, country: competition.ext?.country || null, competition: competition.name, synced_at: now };
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
