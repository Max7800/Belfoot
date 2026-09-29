import { sortPublicSeasons } from "./publicSeasons";

export const PUBLIC_MATCH_FIELDS = "id,competition_id,season_id,home_club_id,away_club_id,kickoff,status,home_score,away_score,round_number,round_raw,phase,ext";
export const PUBLIC_PLAYER_FIELDS = "id,name,photo_url,position,nationality,country,club_id,competition,age,birth_date,tracked,active";
export const PUBLIC_PLAYER_STATS_FIELDS = "id,player_id,club_id,competition_id,season,appearances,lineups,minutes,goals,assists,yellow,red,rating";
export const PUBLIC_MATCH_PLAYER_STATS_FIELDS = "id,match_id,competition_id,player_id,club_id,position,starter,minutes,goals,assists,yellow,red,rating,goals_conceded,synced_at";

export function chunkIds(ids = [], size = 150) {
  const unique = [...new Set(ids.filter(Boolean))];
  const chunks = [];
  for (let index = 0; index < unique.length; index += size) chunks.push(unique.slice(index, index + size));
  return chunks;
}

export async function loadCompetitionSeasons(db, competitionId) {
  const { data, error } = await db.from("seasons").select("*").eq("competition_id", competitionId);
  if (error) throw error;
  return sortPublicSeasons(data || []);
}

export async function loadSeasonMatches(db, competitionId, seasonId, { ascending = true, limit = 600 } = {}) {
  let query = db.from("matches").select(PUBLIC_MATCH_FIELDS).eq("competition_id", competitionId);
  if (seasonId) query = query.eq("season_id", seasonId);
  const { data, error } = await query.order("kickoff", { ascending }).limit(limit);
  if (error) throw error;
  if (data?.length || !seasonId) return data || [];

  // Compatibilité prudente avec les imports historiques antérieurs à season_id : le repli n'est
  // autorisé que si cette compétition ne possède encore aucun match rattaché à une saison.
  const { count, error: countError } = await db.from("matches").select("id", { count: "exact", head: true }).eq("competition_id", competitionId).not("season_id", "is", null);
  if (countError) throw countError;
  if (count) return [];
  const { data: legacy, error: legacyError } = await db.from("matches").select(PUBLIC_MATCH_FIELDS).eq("competition_id", competitionId).is("season_id", null).order("kickoff", { ascending }).limit(limit);
  if (legacyError) throw legacyError;
  return legacy || [];
}

export async function loadClubsForMatches(db, matches = []) {
  const chunks = chunkIds(matches.flatMap((match) => [match.home_club_id, match.away_club_id]));
  if (!chunks.length) return {};
  const results = await Promise.all(chunks.map((ids) => db.from("clubs").select("id,name,short_name,logo_url,team_type,parent_club_id,ext").in("id", ids)));
  const rows = [];
  for (const result of results) {
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

export async function loadMatchStatsForMatches(db, matchIds = []) {
  const chunks = chunkIds(matchIds);
  if (!chunks.length) return [];
  const results = await Promise.all(chunks.map((ids) => db.from("match_player_stats").select(PUBLIC_MATCH_PLAYER_STATS_FIELDS).in("match_id", ids)));
  const rows = [];
  for (const result of results) {
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }
  return rows;
}

export async function loadPlayersByIds(db, playerIds = []) {
  const chunks = chunkIds(playerIds);
  if (!chunks.length) return [];
  const results = await Promise.all(chunks.map((ids) => db.from("players").select(PUBLIC_PLAYER_FIELDS).in("id", ids)));
  const rows = [];
  for (const result of results) {
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }
  return rows.sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr"));
}

export async function loadPlayerStatsForPlayers(db, playerIds = []) {
  const chunks = chunkIds(playerIds);
  if (!chunks.length) return [];
  const results = await Promise.all(chunks.map((ids) => db.from("player_season_stats").select(PUBLIC_PLAYER_STATS_FIELDS).in("player_id", ids)));
  const rows = [];
  for (const result of results) {
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }
  return rows;
}

export async function loadMatchesByIds(db, matchIds = []) {
  const chunks = chunkIds(matchIds);
  if (!chunks.length) return [];
  const results = await Promise.all(chunks.map((ids) => db.from("matches").select(PUBLIC_MATCH_FIELDS).in("id", ids)));
  const rows = [];
  for (const result of results) {
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
  }
  return rows;
}
