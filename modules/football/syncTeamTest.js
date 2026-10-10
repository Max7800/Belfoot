import { getProvider } from "./providers";
import { loadByExternalIds, upsertExternal } from "./sync";
import { ensureSeason, seasonLabel, seasonYear } from "./season";
import { clearUnassignedPlayerStats, upsertPlayerMembership } from "./playerMemberships";
import { providerIdentityPatch } from "@/lib/playerIdentity";
import { playerSnapshotPatch } from "@/lib/playerSnapshot";

function parseRound(raw) {
  if (!raw) return { round_raw: null, phase: null, round_number: null };
  const value = String(raw).trim();
  const parts = value.split(" - ");
  const last = parts[parts.length - 1].trim();
  if (parts.length >= 2 && /^\d+$/.test(last)) return { round_raw: value, phase: parts.slice(0, -1).join(" - ").trim(), round_number: Number(last) };
  return { round_raw: value, phase: value, round_number: null };
}

export async function syncTeamTest(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchClubById || !provider?.fetchTeamMatches || !provider?.fetchSquadPlayers) throw new Error(`${competition.name}: import ciblé non supporté par ${competition.provider}`);
  const teamExternalId = String(ctx.teamExternalId || "").trim();
  if (!teamExternalId) throw new Error("Renseigne l'ID API-Football de l'équipe");
  const selectedSeason = seasonLabel(ctx.season || competition.ext?.season);
  const season = seasonYear(selectedSeason);
  const seasonRow = await ensureSeason(db, competition.id, selectedSeason);

  const leagueInfo = provider.fetchLeagueInfo ? await provider.fetchLeagueInfo(competition, { ...ctx, season }) : null;
  if (leagueInfo) {
    await db.from("competitions").update({
      ext: { ...(competition.ext || {}), season, season_label: selectedSeason, coverage: leagueInfo.coverage, providerName: leagueInfo.name, providerType: leagueInfo.type, country: leagueInfo.country, country_flag: leagueInfo.flag },
    }).eq("id", competition.id);
  }

  const club = await provider.fetchClubById(teamExternalId, { ...ctx, season });
  if (!club) throw new Error(`${competition.name}: équipe ${teamExternalId} introuvable`);
  await upsertExternal(db, "clubs", competition.provider, [club], ["name", "short_name", "logo_url", "city", "founded_year", "stadium_name", "stadium_capacity", "stadium_address", "stadium_image_url"]);

  const matches = await provider.fetchTeamMatches(competition, teamExternalId, { ...ctx, season });
  const derivedClubs = new Map();
  for (const match of matches) {
    if (match.home_ext) derivedClubs.set(match.home_ext, { external_id: match.home_ext, name: match.home_name || match.home_ext, logo_url: match.home_logo || null });
    if (match.away_ext) derivedClubs.set(match.away_ext, { external_id: match.away_ext, name: match.away_name || match.away_ext, logo_url: match.away_logo || null });
  }
  await upsertExternal(db, "clubs", competition.provider, [...derivedClubs.values()], ["name", "logo_url"]);
  // Uniquement les clubs de ces matchs : une lecture de tous les clubs serait tronquée.
  const clubRows = [...(await loadByExternalIds(db, "clubs", competition.provider, [String(teamExternalId), ...derivedClubs.keys()], "id,name,external_id,team_type,parent_club_id,ext")).values()];
  const clubMap = Object.fromEntries(clubRows.map((row) => [String(row.external_id), row.id]));
  const resolvedMatches = matches.map((match) => {
    const round = parseRound(match.round);
    return {
      external_id: match.external_id,
      competition_id: competition.id,
      season_id: seasonRow.id,
      home_club_id: clubMap[match.home_ext] || null,
      away_club_id: clubMap[match.away_ext] || null,
      home_score: match.home_score,
      away_score: match.away_score,
      status: match.status,
      minute: match.minute ?? null,
      kickoff: match.kickoff,
      matchday: round.round_number,
      round_raw: round.round_raw,
      phase: round.phase,
      round_number: round.round_number,
      ext: match,
    };
  });
  await upsertExternal(db, "matches", competition.provider, resolvedMatches, ["competition_id", "season_id", "home_club_id", "away_club_id", "home_score", "away_score", "status", "minute", "kickoff", "matchday", "round_raw", "phase", "round_number"]);

  const teamClubId = clubMap[String(teamExternalId)];
  if (!teamClubId) throw new Error(`${club.name}: club importé mais identifiant local introuvable`);
  const teamClub = (clubRows || []).find((row) => row.id === teamClubId);
  const snapshotCompetition = leagueInfo
    ? { ...competition, name: leagueInfo.name || competition.name, ext: { ...(competition.ext || {}), country: leagueInfo.country, providerType: leagueInfo.type } }
    : competition;
  const squad = await provider.fetchSquadPlayers({ external_id: teamExternalId }, { ...ctx, season, leagueId: competition.external_id });
  const belgians = squad.filter((player) => String(player.nationality || "").toLowerCase() === "belgium");
  const syncedAt = new Date().toISOString();
  for (const player of belgians) {
    const { data: existing, error: existingError } = await db.from("players").select("id,locked,club_id,nationality,country,competition,ext").eq("source", competition.provider).eq("external_id", player.external_id).maybeSingle();
    if (existingError) throw existingError;
    const patch = {
      source: competition.provider,
      external_id: player.external_id,
      name: player.name,
      ...providerIdentityPatch(existing, { nationality: player.nationality, birth_date: player.birth_date }),
      position: player.position,
      photo_url: player.photo_url,
      age: player.age,
      // Instantané « club actuel » : mêmes règles que les effectifs (championnat
      // national de la saison courante seulement ; aucun pays inventé).
      ...playerSnapshotPatch({ existing, club: teamClub || { id: teamClubId }, competition: snapshotCompetition, season, primaryClub: true }),
      tracked: true,
      active: true,
      synced_at: syncedAt,
    };
    let playerId = existing?.id;
    // `locked` protège les champs éditoriaux de la fiche, pas les statistiques
    // de saison stockées dans une table séparée.
    if (existing && !existing.locked) {
      const { error } = await db.from("players").update(patch).eq("id", existing.id);
      if (error) throw error;
    } else if (!existing) {
      const { data, error } = await db.from("players").insert(patch).select("id").single();
      if (error) throw error;
      playerId = data?.id;
    }
    if (playerId && player.stats) {
      await clearUnassignedPlayerStats(db, { playerId, competitionId: competition.id, season });
      const { error } = await db.from("player_season_stats").upsert({ player_id: playerId, club_id: teamClubId, season_id: seasonRow.id, competition_id: competition.id, season, ...player.stats, source: competition.provider, external_id: player.external_id, synced_at: syncedAt }, { onConflict: "player_id,club_id,competition_id,season" });
      if (error) throw new Error(`${player.name}: ${error.message}`);
    }
    if (playerId) await upsertPlayerMembership(db, {
      playerId,
      club: teamClub || { id: teamClubId },
      season,
      source: competition.provider,
      externalId: player.external_id,
      position: player.position,
      shirtNumber: player.number ?? null,
      ext: player.ext || {},
      syncedAt,
    });
  }
  return `${club.name}: ${matches.length} matchs ciblés, ${belgians.length} Belge${belgians.length > 1 ? "s" : ""} suivi${belgians.length > 1 ? "s" : ""} (${season})`;
}
