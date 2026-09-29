import { seasonLabel } from "./season.js";

export function storedSeasonClubExternalIds(competition, season) {
  const selectedSeason = seasonLabel(season || competition?.ext?.season_label || competition?.ext?.season);
  const values = competition?.ext?.club_external_ids_by_season?.[selectedSeason];
  return Array.isArray(values) ? [...new Set(values.map(String).filter(Boolean))] : [];
}

export async function loadCompetitionSeasonClubIds(db, competition, season, matchClubIds = []) {
  const ids = new Set((matchClubIds || []).filter(Boolean));
  const externalIds = storedSeasonClubExternalIds(competition, season);
  if (!externalIds.length) return [...ids];
  const { data, error } = await db.from("clubs").select("id").eq("source", competition.provider).in("external_id", externalIds);
  if (error) throw error;
  for (const club of data || []) if (club.id) ids.add(club.id);
  return [...ids];
}
