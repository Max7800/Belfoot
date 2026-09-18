import { getProvider } from "./providers";
import { clearUnassignedPlayerStats, upsertPlayerMembership } from "./playerMemberships";
import { seasonYear } from "./season";

export async function discoverBelgians(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchSquadPlayers) return `${competition.name}: squad non supporté`;
  if (competition.ext?.coverage && competition.ext.coverage.players === false) return `${competition.name}: joueurs non couverts`;
  const nationality = ctx.nationality || "Belgium";
  const season = String(seasonYear(ctx.season || competition.ext?.season));
  const { data: seasonRows, error: seasonsError } = await db.from("seasons").select("id,label").eq("competition_id", competition.id);
  if (seasonsError) throw seasonsError;
  const seasonRow = (seasonRows || []).find((row) => String(row.label || "").includes(season));
  let matchesQuery = db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
  if (seasonRow?.id) matchesQuery = matchesQuery.eq("season_id", seasonRow.id);
  const { data: matches, error: matchesError } = await matchesQuery;
  if (matchesError) throw matchesError;
  const clubIds = [...new Set((matches || []).flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
  if (!clubIds.length) return `${competition.name}: aucun club (fais d'abord l'import)`;
  const { data: clubs, error: clubsError } = await db.from("clubs").select("id,name,external_id,team_type,parent_club_id").in("id", clubIds);
  if (clubsError) throw clubsError;
  let found = 0;
  for (const club of clubs || []) {
    const players = await provider.fetchSquadPlayers({ external_id: club.external_id }, { ...ctx, leagueId: competition.external_id });
    const belgians = players.filter((p) => (p.nationality || "").toLowerCase() === nationality.toLowerCase());
    for (const p of belgians) {
      const { data: existing, error: existingError } = await db.from("players").select("id,locked,club_id").eq("source", competition.provider).eq("external_id", p.external_id).maybeSingle();
      if (existingError) throw existingError;
      const primaryClub = !["reserve", "u23", "youth", "women"].includes(club.team_type);
      const patch = { source: competition.provider, external_id: p.external_id, name: p.name, nationality: p.nationality, position: p.position, photo_url: p.photo_url, club_id: primaryClub || !existing?.club_id ? club.id : existing.club_id, country: competition.ext?.country || null, competition: competition.name, synced_at: new Date().toISOString() };
      let playerId = existing?.id;
      if (existing && !existing.locked) {
        const { error } = await db.from("players").update(patch).eq("id", existing.id);
        if (error) throw error;
      } else if (!existing) {
        const { data, error } = await db.from("players").insert({ ...patch, tracked: false, active: true }).select("id").single();
        if (error) throw error;
        playerId = data?.id;
      }
      if (playerId) await upsertPlayerMembership(db, {
        playerId,
        club,
        season,
        source: competition.provider,
        externalId: p.external_id,
        position: p.position,
        isPrimary: primaryClub,
        ext: p.ext || {},
      });
      if (playerId && p.stats) {
        await clearUnassignedPlayerStats(db, { playerId, competitionId: competition.id, season });
        const { error } = await db.from("player_season_stats").upsert({
          player_id: playerId,
          club_id: club.id,
          season_id: seasonRow?.id || null,
          competition_id: competition.id,
          season,
          ...p.stats,
          source: competition.provider,
          external_id: p.external_id,
          synced_at: new Date().toISOString(),
        }, { onConflict: "player_id,club_id,competition_id,season" });
        if (error) throw new Error(`${competition.name}: stats ${p.name}: ${error.message}`);
      }
      found++;
    }
  }
  return `${competition.name}: ${found} ${nationality}`;
}
