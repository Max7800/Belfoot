import { getProvider } from "./providers";
import { upsertExternal } from "./sync";
import { squadRoleForClub, upsertPlayerMembership } from "./playerMemberships";

function inferredTeamType(name) {
  const value = String(name || "").toLowerCase();
  if (/\b(u23|jong|futures|nxt|reserve|réserve)\b/.test(value)) return "u23";
  if (/\b(u\d{2}|youth|academy|jeunes?)\b/.test(value)) return "youth";
  if (/\b(women|féminin|feminin|dames)\b/.test(value)) return "women";
  return "first_team";
}

export async function syncPlayerCareers(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchPlayerCareer) throw new Error(`${competition.name}: historiques de carrière non supportés`);
  const batchSize = Math.max(1, Math.min(Number(ctx.batchSize) || 5, 25));
  const { data: matches, error: matchesError } = await db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
  if (matchesError) throw matchesError;
  const clubIds = [...new Set((matches || []).flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
  if (!clubIds.length) return `${competition.name}: aucun club rattaché`;
  const { data: players, error: playersError } = await db.from("players")
    .select("id,name,external_id,source,career_sync_status,career_synced_at")
    .eq("tracked", true).eq("active", true).eq("source", competition.provider)
    .in("club_id", clubIds)
    .order("career_synced_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true })
    .limit(batchSize);
  if (playersError) throw playersError;
  if (!players?.length) return `${competition.name}: aucun joueur suivi à traiter`;

  let memberships = 0;
  const errors = [];
  for (const player of players) {
    await db.from("players").update({ career_sync_status: "running" }).eq("id", player.id);
    try {
      const history = await provider.fetchPlayerCareer(player, ctx);
      await upsertExternal(db, "clubs", competition.provider, history.map((row) => ({ ...row.team, team_type: inferredTeamType(row.team.name) })), ["name", "logo_url", "team_type"]);
      const externalIds = [...new Set(history.map((row) => row.team.external_id))];
      const { data: clubs, error: clubsError } = externalIds.length
        ? await db.from("clubs").select("id,external_id,team_type").eq("source", competition.provider).in("external_id", externalIds)
        : { data: [], error: null };
      if (clubsError) throw clubsError;
      const clubMap = Object.fromEntries((clubs || []).map((club) => [club.external_id, club]));
      for (const row of history) {
        const club = clubMap[row.team.external_id];
        if (!club) continue;
        await upsertPlayerMembership(db, {
          playerId: player.id,
          club,
          season: row.season,
          source: competition.provider,
          externalId: player.external_id,
          squadRole: squadRoleForClub(club),
          isPrimary: club.team_type === "first_team",
          active: false,
          ext: row.ext,
        });
        memberships++;
      }
      await db.from("players").update({ career_sync_status: "ok", career_synced_at: new Date().toISOString() }).eq("id", player.id);
    } catch (error) {
      await db.from("players").update({ career_sync_status: "error", career_synced_at: new Date().toISOString() }).eq("id", player.id);
      errors.push(`${player.name}: ${error.message || String(error)}`);
    }
  }
  return `${competition.name}: ${players.length} carrière(s), ${memberships} affectation(s) historiques${errors.length ? ` · ${errors.length} erreur(s): ${errors.join("; ")}` : ""}`;
}
