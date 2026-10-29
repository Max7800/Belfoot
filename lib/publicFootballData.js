import { publicSeasonState, sortPublicSeasons } from "./publicSeasons";
import { readChunks } from "./readAll";

export const PUBLIC_MATCH_FIELDS = "id,competition_id,season_id,home_club_id,away_club_id,kickoff,status,home_score,away_score,round_number,round_raw,phase,ext";
export const PUBLIC_PLAYER_FIELDS = "id,name,photo_url,position,nationality,national_team_id,country,club_id,competition,age,birth_date,tracked,active";
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

// Saisons publiques et signal « saisons existantes mais aucune publiée ».
export async function loadPublicSeasonState(db, competitionId) {
  const { data, error } = await db.from("seasons").select("*").eq("competition_id", competitionId);
  if (error) throw error;
  return publicSeasonState(data || []);
}

export async function loadSeasonMatches(db, competitionId, seasonId, { ascending = true, limit = 600 } = {}) {
  if (!seasonId) {
    // Sans saison choisie, ne JAMAIS mélanger les campagnes : si la compétition a des
    // saisons (aucune publiée), rien n'est affiché. Le chargement de tous ses matchs
    // reste réservé aux anciens imports sans aucune saison.
    const { count: seasonCount, error: seasonError } = await db.from("seasons").select("id", { count: "exact", head: true }).eq("competition_id", competitionId);
    if (seasonError) throw seasonError;
    if (seasonCount) return [];
  }
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
  const { data: rows, error } = await readChunks(chunks, (ids) => db.from("clubs").select("id,name,short_name,logo_url,team_type,parent_club_id,ext").in("id", ids));
  if (error) throw error;
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

// Tri par la colonne filtrée avant id (readAll ajoute id en dernier) : trié par id
// seul, Postgres parcourait toute la table quand une tranche ne trouvait presque
// rien (1,7 s au lieu de 0,2 s mesurés le 30/10/2026 ; 3,5 s par tranche sur la page
// d'une compétition, dont la moitié des matchs étaient encore à jouer).
export async function loadMatchStatsForMatches(db, matchIds = []) {
  const chunks = chunkIds(matchIds);
  if (!chunks.length) return [];
    // Un paquet de 150 matchs compte jusqu'à ~4 000 performances : lecture complète.
  const { data: rows, error } = await readChunks(chunks, (ids) => db.from("match_player_stats").select(PUBLIC_MATCH_PLAYER_STATS_FIELDS).in("match_id", ids).order("match_id"));
  if (error) throw error;
  return rows;
}

export async function loadPlayersByIds(db, playerIds = []) {
  const chunks = chunkIds(playerIds);
  if (!chunks.length) return [];
  const { data: rows, error } = await readChunks(chunks, (ids) => db.from("players").select(PUBLIC_PLAYER_FIELDS).in("id", ids));
  if (error) throw error;
  return rows.sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr"));
}

// sinceSeason : seulement les saisons à partir de cette année de début (« 2026 »
// garde « 2026-2027 » et la saison civile « 2026 »). L'accueil et la page Belges
// lisaient les 5 saisons passées importées le 29/10/2026 pour n'en afficher qu'une.
export async function loadPlayerStatsForPlayers(db, playerIds = [], { sinceSeason = null } = {}) {
  const chunks = chunkIds(playerIds);
  if (!chunks.length) return [];
  const { data: rows, error } = await readChunks(chunks, (ids) => {
    const query = db.from("player_season_stats").select(PUBLIC_PLAYER_STATS_FIELDS).in("player_id", ids);
    return (sinceSeason ? query.gte("season", String(sinceSeason)) : query).order("player_id");
  });
  if (error) throw error;
  return rows;
}

export async function loadMatchesByIds(db, matchIds = []) {
  const chunks = chunkIds(matchIds);
  if (!chunks.length) return [];
  const { data: rows, error } = await readChunks(chunks, (ids) => db.from("matches").select(PUBLIC_MATCH_FIELDS).in("id", ids));
  if (error) throw error;
  return rows;
}

// Parcours en club (affectations saison par saison) de plusieurs joueurs.
export async function loadMembershipsForPlayers(db, playerIds = []) {
  const chunks = chunkIds(playerIds);
  if (!chunks.length) return [];
  const { data: rows, error } = await readChunks(chunks, (ids) => db.from("player_team_seasons").select("id,player_id,club_id,season_start_year,active,is_primary,joined_at,updated_at").in("player_id", ids).order("player_id"));
  if (error) throw error;
  return rows;
}
