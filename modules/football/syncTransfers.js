import { getProvider } from "./providers";
import { upsertPlayerMembership } from "./playerMemberships";
import { loadCompetitionSeasonClubIds } from "./seasonClubs";

const seasonStart = (value) => Number((String(value || "").match(/\d{4}/) || [0])[0]);
const transferSeason = (date) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCMonth() >= 5 ? parsed.getUTCFullYear() : parsed.getUTCFullYear() - 1;
};

export async function syncTransfers(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchTeamTransfers) return `${competition.name}: transferts non supportés`;
  const season = seasonStart(ctx.season || competition.ext?.season);
  if (!season) throw new Error("Saison invalide pour les transferts");

  const { data: seasonRow } = await db.from("seasons").select("id").eq("competition_id", competition.id).ilike("label", `${season}%`).maybeSingle();
  let matchesQuery = db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
  if (seasonRow?.id) matchesQuery = matchesQuery.eq("season_id", seasonRow.id);
  const { data: matches, error: matchesError } = await matchesQuery;
  if (matchesError) throw matchesError;
  const matchClubIds = [...new Set((matches || []).flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
  const clubIds = await loadCompetitionSeasonClubIds(db, competition, ctx.season, matchClubIds);
  const { data: clubs, error: clubsError } = clubIds.length
    ? await db.from("clubs").select("id,name,external_id,team_type,parent_club_id").in("id", clubIds).order("id")
    : { data: [], error: null };
  if (clubsError) throw clubsError;
  if (!clubs?.length) return `${competition.name}: aucun club`;

  const { data: knownClubs, error: knownClubsError } = await db.from("clubs")
    .select("id,name,external_id,team_type,parent_club_id")
    .eq("source", competition.provider)
    .not("external_id", "is", null);
  if (knownClubsError) throw knownClubsError;
  const clubByExternalId = new Map((knownClubs || []).map((club) => [String(club.external_id), club]));

  const startClubIndex = Math.max(0, Number(ctx.startClubIndex) || 0);
  const batchSize = Math.max(1, Math.min(Number(ctx.clubBatchSize) || (ctx.pipelineRunId ? 3 : clubs.length), 6));
  const endClubIndex = Math.min(clubs.length, startClubIndex + batchSize);
  let imported = 0;
  let rosterChanges = 0;
  const now = new Date().toISOString();

  for (let clubIndex = startClubIndex; clubIndex < endClubIndex; clubIndex++) {
    const transfers = (await provider.fetchTeamTransfers(clubs[clubIndex], ctx))
      .filter((transfer) => transferSeason(transfer.transfer_date) === season)
      .sort((a, b) => String(a.transfer_date || "").localeCompare(String(b.transfer_date || "")));
    const playerExternalIds = [...new Set(transfers.map((transfer) => transfer.player_external_id))];
    const { data: existingPlayers, error: playersError } = playerExternalIds.length
      ? await db.from("players").select("id,external_id,locked,club_id").eq("source", competition.provider).in("external_id", playerExternalIds)
      : { data: [], error: null };
    if (playersError) throw playersError;
    const playerByExternalId = new Map((existingPlayers || []).map((player) => [String(player.external_id), player]));

    for (const transfer of transfers) {
      const fromClub = clubByExternalId.get(String(transfer.from_club_external_id || "")) || null;
      const toClub = clubByExternalId.get(String(transfer.to_club_external_id || "")) || null;
      const externalId = [transfer.player_external_id, transfer.transfer_date, transfer.from_club_external_id || "none", transfer.to_club_external_id || "none"].join(":");
      let player = playerByExternalId.get(transfer.player_external_id) || null;

      if (!player && toClub) {
        const { data: inserted, error } = await db.from("players").insert({
          source: competition.provider,
          external_id: transfer.player_external_id,
          name: transfer.player_name,
          club_id: toClub.id,
          active: true,
          tracked: false,
          ext: { transfer_only: true },
          synced_at: now,
        }).select("id,external_id,locked,club_id").single();
        if (error) throw error;
        player = inserted;
        playerByExternalId.set(transfer.player_external_id, inserted);
      }

      const { data: existingTransfer, error: existingTransferError } = await db.from("player_transfers")
        .select("id,locked").eq("source", competition.provider).eq("external_id", externalId).maybeSingle();
      if (existingTransferError) throw existingTransferError;
      const transferPatch = {
        player_id: player?.id || null,
        player_external_id: transfer.player_external_id,
        player_name: transfer.player_name,
        from_club_id: fromClub?.id || null,
        to_club_id: toClub?.id || null,
        from_club_external_id: transfer.from_club_external_id,
        to_club_external_id: transfer.to_club_external_id,
        from_club_name: transfer.from_club_name,
        to_club_name: transfer.to_club_name,
        transfer_date: transfer.transfer_date,
        transfer_type: transfer.transfer_type,
        season_start_year: season,
        source: competition.provider,
        external_id: externalId,
        ext: transfer.ext || {},
        synced_at: now,
        updated_at: now,
      };
      if (!existingTransfer?.locked) {
        const { error } = existingTransfer
          ? await db.from("player_transfers").update(transferPatch).eq("id", existingTransfer.id)
          : await db.from("player_transfers").insert(transferPatch);
        if (error) throw error;
      }
      imported++;

      if (!player || player.locked) continue;
      if (fromClub && fromClub.id !== toClub?.id) {
        const { error } = await db.from("player_team_seasons").update({ active: false, left_at: transfer.transfer_date, synced_at: now, updated_at: now })
          .eq("player_id", player.id).eq("club_id", fromClub.id).eq("season_start_year", season).eq("locked", false)
          .or(`joined_at.is.null,joined_at.lte.${transfer.transfer_date}`);
        if (error) throw error;
        rosterChanges++;
      }
      if (toClub && fromClub?.id !== toClub.id) {
        await upsertPlayerMembership(db, {
          playerId: player.id,
          club: toClub,
          season: String(season),
          source: competition.provider,
          externalId: transfer.player_external_id,
          isPrimary: !["reserve", "u23", "youth", "women"].includes(toClub.team_type),
          membershipType: /loan|prêt/i.test(transfer.transfer_type || "") ? "loan" : "permanent",
          joinedAt: transfer.transfer_date,
          leftAt: null,
          active: true,
          ext: { transfer_type: transfer.transfer_type },
          syncedAt: now,
        });
        const { error } = await db.from("players").update({ club_id: toClub.id, active: true, synced_at: now }).eq("id", player.id).eq("locked", false);
        if (error) throw error;
        rosterChanges++;
      } else if (fromClub && player.club_id === fromClub.id) {
        const { error } = await db.from("players").update({ club_id: null, synced_at: now }).eq("id", player.id).eq("locked", false);
        if (error) throw error;
      }
    }
    await ctx.saveClubCheckpoint?.(clubIndex + 1);
  }

  return {
    detail: `${competition.name}: ${imported} transfert(s), ${rosterChanges} ajustement(s) d'effectif · clubs ${endClubIndex}/${clubs.length}`,
    complete: endClubIndex >= clubs.length,
    progress: { current: endClubIndex, total: clubs.length, unit: "clubs" },
  };
}
