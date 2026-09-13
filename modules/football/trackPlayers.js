import { getProvider } from "./providers";

export async function trackPlayers(db, ctx = {}) {
  const { data: players } = await db.from("players").select("*").eq("tracked", true);
  if (!players?.length) return "aucun joueur suivi (tracked)";
  let n = 0;
  for (const p of players) {
    const provider = getProvider(p.source);
    if (!provider?.fetchPlayerSeason) continue;
    const s = await provider.fetchPlayerSeason({ external_id: p.external_id }, ctx);
    if (!s) continue;
    await db.from("player_season_stats").upsert({
      player_id: p.id, season: s.season,
      appearances: s.appearances, lineups: s.lineups, minutes: s.minutes, goals: s.goals, assists: s.assists,
      yellow: s.yellow, red: s.red, rating: s.rating,
      source: p.source, external_id: p.external_id, synced_at: new Date().toISOString(),
    }, { onConflict: "player_id,season" });
    n++;
  }
  return `${n} joueur(s) suivi(s) mis à jour`;
}
