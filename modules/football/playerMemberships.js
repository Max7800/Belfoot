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
  joinedAt,
  leftAt,
  membershipType = "registered",
  squadRole,
  isPrimary = true,
  active = true,
  preserveExisting = false,
  ext = {},
  syncedAt = new Date().toISOString(),
}) {
  if (!playerId || !club?.id || !season) return null;
  const seasonValue = String(season);
  const year = seasonStart(seasonValue);
  const yearFormat = seasonValue.match(/^(\d{4})(?:-(\d{4}))?$/);
  const standardSeason = yearFormat && (!yearFormat[2] || Number(yearFormat[2]) === year + 1);
  let existingQuery = db
    .from("player_team_seasons")
    .select("id,locked,season")
    .eq("player_id", playerId)
    .eq("club_id", club.id);
  // Les synchronisations existantes écrivent parfois « 2026 » et les
  // carrières « 2026-2027 » : ce sont la même affectation sportive.
  existingQuery = standardSeason
    ? existingQuery.or(`season.eq.${year},season.eq.${year}-${year + 1}`)
    : existingQuery.eq("season", seasonValue);
  const { data: candidates, error: selectError } = await existingQuery.order("id", { ascending: true });
  if (selectError) throw new Error(`Affectation joueur: ${selectError.message}`);
  const existing = (candidates || []).find((row) => row.locked)
    || (candidates || []).find((row) => row.season === seasonValue)
    || candidates?.[0];
  if (existing?.locked) return existing;
  // Les données de carrière décrivent un passage, pas l'état d'un effectif.
  // Une affectation déjà connue peut contenir des données plus précises.
  if (existing && preserveExisting) return existing;

  const patch = {
    player_id: playerId,
    club_id: club.id,
    season: existing?.season || (standardSeason ? `${year}-${year + 1}` : seasonValue),
    season_start_year: seasonStart(seasonValue),
    membership_type: membershipType,
    squad_role: squadRole || squadRoleForClub(club),
    is_primary: isPrimary,
    active,
    shirt_number: shirtNumber,
    ...(joinedAt !== undefined ? { joined_at: joinedAt } : {}),
    ...(leftAt !== undefined ? { left_at: leftAt } : {}),
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
