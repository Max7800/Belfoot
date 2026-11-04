import { cupWinnerCandidate, leagueWinnerCandidate } from "./competitionWinnerCandidate";

// Trois réponses permettent de détecter une finale qui ne serait pas un aller-retour.
export async function loadCupWinnerSuggestions(db, competition) {
  const { data: seasons, error } = await db.from("seasons").select("id,label").eq("competition_id", competition.id).order("label", { ascending: false }).limit(12);
  if (error) throw error;
  const items = [];
  for (const season of seasons || []) {
    const imported = Boolean(competition.ext?.full_competition_seasons?.[season.label]);
    if (!imported) { items.push({ season: season.label, status: "needs_review", reason: "Import complet non confirmé" }); continue; }
    let result;
    if (competition.competition_type === "league") {
      const [total, finished] = await Promise.all([
        db.from("matches").select("id", { count: "exact", head: true }).eq("competition_id", competition.id).eq("season_id", season.id),
        db.from("matches").select("id", { count: "exact", head: true }).eq("competition_id", competition.id).eq("season_id", season.id).eq("status", "finished"),
      ]);
      if (total.error || finished.error) throw total.error || finished.error;
      result = leagueWinnerCandidate({ competitionType: "league", groups: competition.ext?.standings_by_season?.[season.label], complete: imported, totalMatches: total.count, finishedMatches: finished.count });
    } else {
      const { data: matches, error: matchError } = await db.from("matches").select("id,round_raw,phase,kickoff,status,home_club_id,away_club_id,home_score,away_score,ext").eq("competition_id", competition.id).eq("season_id", season.id).ilike("round_raw", "Final").limit(3);
      if (matchError) throw matchError;
      result = cupWinnerCandidate({ competitionType: competition.competition_type, matches: matches || [], complete: imported });
    }
    if (result.status !== "candidate") { items.push({ season: season.label, status: "needs_review", reason: result.reason }); continue; }
    const { data: club, error: clubError } = await db.from("clubs").select("name").eq("id", result.clubId).maybeSingle();
    if (clubError) throw clubError;
    items.push(club?.name ? { season: season.label, status: "candidate", winner: club.name, clubId: result.clubId, ...(result.matchId ? { matchId: result.matchId } : {}), ...(result.matchIds ? { matchIds: result.matchIds } : {}) } : { season: season.label, status: "needs_review", reason: "Club introuvable" });
  }
  return items;
}
