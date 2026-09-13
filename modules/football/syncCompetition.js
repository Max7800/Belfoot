import { getProvider } from "./providers";
import { upsertExternal } from "./sync";

// Importe clubs + matchs d'une compétition depuis son provider, chez nous.
export async function syncCompetition(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider) return `${competition.name}: aucun provider`;
  let clubsN = 0, matchN = 0;

  if (provider.fetchClubs) {
    const clubs = await provider.fetchClubs(competition, ctx);
    clubsN = await upsertExternal(db, "clubs", competition.provider, clubs, ["name", "short_name", "logo_url", "city"]);
  }
  // mapping id externe -> id interne de nos clubs
  const { data: mine } = await db.from("clubs").select("id,external_id").eq("source", competition.provider);
  const map = Object.fromEntries((mine || []).map((c) => [c.external_id, c.id]));

  if (provider.fetchMatches) {
    const matches = await provider.fetchMatches(competition, ctx);
    const resolved = matches.map((m) => ({
      external_id: m.external_id, competition_id: competition.id,
      home_club_id: map[m.home_ext] || null, away_club_id: map[m.away_ext] || null,
      home_score: m.home_score, away_score: m.away_score, status: m.status, minute: m.minute ?? null,
      kickoff: m.kickoff, matchday: m.matchday, ext: m,
    }));
    matchN = await upsertExternal(db, "matches", competition.provider, resolved,
      ["competition_id", "home_club_id", "away_club_id", "home_score", "away_score", "status", "minute", "kickoff", "matchday"]);
  }
  return `${competition.name}: ${clubsN} clubs, ${matchN} matchs`;
}
