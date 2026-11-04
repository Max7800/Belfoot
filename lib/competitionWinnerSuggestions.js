import { cupWinnerCandidate } from "./competitionWinnerCandidate";

// Lecture bornée à 12 saisons et deux finales par saison. Aucun appel externe.
export async function loadCupWinnerSuggestions(db, competition) {
  const { data: seasons, error } = await db.from("seasons").select("id,label").eq("competition_id", competition.id).order("label", { ascending: false }).limit(12);
  if (error) throw error;
  const items = [];
  for (const season of seasons || []) {
    const imported = Boolean(competition.ext?.full_competition_seasons?.[season.label]);
    if (!imported) { items.push({ season: season.label, status: "needs_review", reason: "Import complet non confirmé" }); continue; }
    const { data: matches, error: matchError } = await db.from("matches").select("id,round_raw,phase,status,home_club_id,away_club_id,home_score,away_score,ext").eq("competition_id", competition.id).eq("season_id", season.id).ilike("round_raw", "Final").limit(2);
    if (matchError) throw matchError;
    const result = cupWinnerCandidate({ competitionType: competition.competition_type, matches: matches || [], complete: imported });
    if (result.status !== "candidate") { items.push({ season: season.label, status: "needs_review", reason: result.reason }); continue; }
    const { data: club, error: clubError } = await db.from("clubs").select("name").eq("id", result.clubId).maybeSingle();
    if (clubError) throw clubError;
    items.push(club?.name ? { season: season.label, status: "candidate", winner: club.name, matchId: result.matchId } : { season: season.label, status: "needs_review", reason: "Club introuvable" });
  }
  return items;
}
