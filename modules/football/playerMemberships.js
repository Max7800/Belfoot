export function seasonStart(value) {
  const year = Number((String(value || "").match(/\d{4}/) || [0])[0]);
  return year || null;
}

export function squadRoleForClub(club) {
  return ["reserve", "u23", "youth", "women"].includes(club?.team_type)
    ? club.team_type
    : "first_team";
}

export async function clearUnassignedPlayerStats(db, { playerId, competitionId, season }) {
  if (!playerId || !competitionId || !season) return;
  const { error } = await db
    .from("player_season_stats")
    .delete()
    .eq("player_id", playerId)
    .eq("competition_id", competitionId)
    .eq("season", String(season))
    .is("club_id", null)
    .eq("locked", false);
  if (error) throw new Error(`Nettoyage stats non attribuées: ${error.message}`);
}

export async function upsertPlayerMembership(db, {
  playerId,
  club,
  season,
  source = "manual",
  externalId = null,
  position = null,
  shirtNumber = null,
  membershipType = "registered",
  squadRole,
  isPrimary = true,
  active = true,
  ext = {},
  syncedAt = new Date().toISOString(),
}) {
  if (!playerId || !club?.id || !season) return null;
  const seasonValue = String(season);
  const { data: existing, error: selectError } = await db
    .from("player_team_seasons")
    .select("id,locked")
    .eq("player_id", playerId)
    .eq("club_id", club.id)
    .eq("season", seasonValue)
    .maybeSingle();
  if (selectError) throw new Error(`Affectation joueur: ${selectError.message}`);
  if (existing?.locked) return existing;

  const patch = {
    player_id: playerId,
    club_id: club.id,
    season: seasonValue,
    season_start_year: seasonStart(seasonValue),
    membership_type: membershipType,
    squad_role: squadRole || squadRoleForClub(club),
    is_primary: isPrimary,
    active,
    shirt_number: shirtNumber,
    position,
    source,
    external_id: externalId,
    ext: ext || {},
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
  const query = existing
    ? db.from("player_team_seasons").update(patch).eq("id", existing.id)
    : db.from("player_team_seasons").insert(patch);
  const { data, error } = await query.select("id").single();
  if (error) throw new Error(`Affectation joueur: ${error.message}`);
  return data;
}
