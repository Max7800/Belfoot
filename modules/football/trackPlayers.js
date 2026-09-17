import { getProvider } from "./providers";

export async function trackPlayers(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchPlayerSeason) return `${competition.name}: tracking non supporté`;

  const { data: matches, error: matchesError } = await db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
  if (matchesError) throw matchesError;
  const clubIds = [...new Set((matches || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
  if (!clubIds.length) return `${competition.name}: aucun club`;

  const { data: players, error: playersError } = await db.from("players").select("*").eq("tracked", true).eq("source", competition.provider).in("club_id", clubIds);
  if (playersError) throw playersError;
  if (!players?.length) return `${competition.name}: aucun joueur suivi (tracked)`;

  let n = 0;
  for (const p of players) {
    const s = await provider.fetchPlayerSeason({ external_id: p.external_id }, { ...ctx, leagueId: competition.external_id });
    if (!s) continue;
    const { error } = await db.from("player_season_stats").upsert({
      player_id: p.id, competition_id: competition.id, season: s.season,
      appearances: s.appearances, lineups: s.lineups, minutes: s.minutes, goals: s.goals, assists: s.assists,
      yellow: s.yellow, red: s.red, rating: s.rating,
      source: p.source, external_id: p.external_id, synced_at: new Date().toISOString(),
    }, { onConflict: "player_id,competition_id,season" });
    if (error) throw new Error(`${competition.name}: stats ${p.name}: ${error.message}`);
    n++;
  }
  return `${competition.name}: ${n} joueur(s) suivi(s) mis à jour`;
}
