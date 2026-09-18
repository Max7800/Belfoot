import { getProvider } from "./providers";
import { seasonYear } from "./season";

export async function trackPlayers(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchPlayerSeason) return `${competition.name}: tracking non supporté`;

  const { data: matches, error: matchesError } = await db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
  if (matchesError) throw matchesError;
  const clubIds = [...new Set((matches || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
  if (!clubIds.length) return `${competition.name}: aucun club`;

  const season = String(seasonYear(ctx.season || competition.ext?.season));
  const [{ data: memberships, error: membershipsError }, { data: seasonRows, error: seasonsError }] = await Promise.all([
    db.from("player_team_seasons").select("player_id,club_id,is_primary").eq("season_start_year", Number(season)).eq("active", true).in("club_id", clubIds),
    db.from("seasons").select("id,label").eq("competition_id", competition.id),
  ]);
  if (membershipsError) throw membershipsError;
  if (seasonsError) throw seasonsError;
  const seasonRow = (seasonRows || []).find((row) => String(row.label || "").includes(season));
  const membershipPlayerIds = [...new Set((memberships || []).map((row) => row.player_id))];
  let playersQuery = db.from("players").select("*").eq("tracked", true).eq("source", competition.provider);
  playersQuery = membershipPlayerIds.length ? playersQuery.in("id", membershipPlayerIds) : playersQuery.in("club_id", clubIds);
  const { data: players, error: playersError } = await playersQuery;
  if (playersError) throw playersError;
  if (!players?.length) return `${competition.name}: aucun joueur suivi (tracked)`;

  let n = 0;
  for (const p of players) {
    const s = await provider.fetchPlayerSeason({ external_id: p.external_id }, { ...ctx, leagueId: competition.external_id });
    if (!s) continue;
    const membership = (memberships || []).find((row) => row.player_id === p.id && row.is_primary)
      || (memberships || []).find((row) => row.player_id === p.id);
    const clubId = membership?.club_id || p.club_id || null;
    const { error } = await db.from("player_season_stats").upsert({
      player_id: p.id, club_id: clubId, season_id: seasonRow?.id || null, competition_id: competition.id, season: s.season,
      appearances: s.appearances, lineups: s.lineups, minutes: s.minutes, goals: s.goals, assists: s.assists,
      yellow: s.yellow, red: s.red, rating: s.rating,
      source: p.source, external_id: p.external_id, synced_at: new Date().toISOString(),
    }, { onConflict: "player_id,club_id,competition_id,season" });
    if (error) throw new Error(`${competition.name}: stats ${p.name}: ${error.message}`);
    n++;
  }
  return `${competition.name}: ${n} joueur(s) suivi(s) mis à jour`;
}
