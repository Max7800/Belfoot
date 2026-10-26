// Lectures publiques des métadonnées de page (layout.js serveur). Toujours
// tolérantes : une erreur ou une ligne absente donne des métadonnées génériques.
import { clubMetadata, competitionMetadata, matchMetadata, playerMetadata } from "./pageMetadata";
import { resolveCompetitionRoute } from "./competitionRoutes";
import { safeRead } from "./publicServerClient";

const one = async (query) => { const { data, error } = await query; if (error) throw error; return data; };

export async function loadPlayerMetadata(db, id) {
  if (!db || !id) return playerMetadata(null);
  const player = await safeRead(() => one(db.from("players").select("id,name,position,nationality,photo_url,club_id").eq("id", id).maybeSingle()));
  const club = player?.club_id ? await safeRead(() => one(db.from("clubs").select("id,name").eq("id", player.club_id).maybeSingle())) : null;
  return playerMetadata(player, club);
}

export async function loadClubMetadata(db, id) {
  if (!db || !id) return clubMetadata(null);
  const club = await safeRead(() => one(db.from("clubs").select("id,name,logo_url,ext").eq("id", id).maybeSingle()));
  return clubMetadata(club ? { ...club, country: club.ext?.country || null } : null);
}

export async function loadCompetitionMetadata(db, slug) {
  if (!db || !slug) return competitionMetadata(null);
  const competitions = await safeRead(() => one(db.from("competitions").select("id,name,slug,header_title,logo_url,banner_url,public_visible,competition_scope")), []);
  const competition = resolveCompetitionRoute(competitions, slug) || null;
  if (!competition) return competitionMetadata(null);
  const season = await safeRead(() => one(db.from("seasons").select("label").eq("competition_id", competition.id).eq("public_active", true).maybeSingle()));
  return competitionMetadata(competition, season?.label || null);
}

export async function loadMatchMetadata(db, id) {
  if (!db || !id) return matchMetadata(null);
  const match = await safeRead(() => one(db.from("matches").select("id,kickoff,status,home_score,away_score,home_club_id,away_club_id,competition_id").eq("id", id).maybeSingle()));
  if (!match) return matchMetadata(null);
  const clubIds = [match.home_club_id, match.away_club_id].filter(Boolean);
  const [clubs, competition] = await Promise.all([
    clubIds.length ? safeRead(() => one(db.from("clubs").select("id,name,logo_url").in("id", clubIds)), []) : [],
    match.competition_id ? safeRead(() => one(db.from("competitions").select("id,name").eq("id", match.competition_id).maybeSingle())) : null,
  ]);
  const byId = Object.fromEntries((clubs || []).map((club) => [club.id, club]));
  return matchMetadata(match, byId[match.home_club_id], byId[match.away_club_id], competition);
}
