import { readAll, readChunks } from "@/lib/readAll";
import { loadCompetitionSeasonClubIds } from "./seasonClubs";
import { seasonLabel } from "./season";

// Une affectation de saison reste pertinente même après un transfert. Le club
// courant et le drapeau de suivi des Belges ne définissent pas le périmètre.
export async function loadDivisionCareerPlayers(db, competition, season) {
  const requested = season || competition.ext?.season_label || competition.ext?.season;
  if (!requested || !/\d{4}/.test(String(requested))) throw new Error("Saison requise pour les carrières de division");
  const label = seasonLabel(requested);
  const year = Number(label.slice(0, 4));
  const { data: row, error: seasonError } = await db.from("seasons").select("id").eq("competition_id", competition.id).eq("label", label).maybeSingle();
  if (seasonError) throw seasonError;
  const matches = row?.id
    ? await readAll(() => db.from("matches").select("id,home_club_id,away_club_id").eq("competition_id", competition.id).eq("season_id", row.id))
    : { data: [], error: null };
  if (matches.error) throw matches.error;
  const clubIds = await loadCompetitionSeasonClubIds(db, competition, label, (matches.data || []).flatMap((m) => [m.home_club_id, m.away_club_id]));
  if (!clubIds.length) throw new Error(`${competition.name}: aucun club rattaché à ${label}`);
  const memberships = await readAll(() => db.from("player_team_seasons").select("id,player_id").in("club_id", clubIds)
    .or(`season_start_year.eq.${year},season.eq.${label},season.eq.${year}`));
  if (memberships.error) throw memberships.error;
  const ids = [...new Set((memberships.data || []).map((m) => m.player_id).filter(Boolean))];
  const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));
  const result = await readChunks(chunks, (chunk) => db.from("players").select("id,name,external_id,source,nationality,career_sync_status,career_synced_at,ext").eq("source", competition.provider).not("external_id", "is", null).in("id", chunk));
  if (result.error) throw result.error;
  return { players: result.data || [], clubIds, label, membershipCount: ids.length };
}

export function pendingDivisionCareerPlayers(players, refreshBefore) {
  return players.filter((player) => !player.career_synced_at || ["error", "running"].includes(player.career_sync_status) || (refreshBefore && player.career_synced_at < refreshBefore))
    .sort((a, b) => String(a.career_synced_at || "").localeCompare(String(b.career_synced_at || "")) || String(a.id).localeCompare(String(b.id)));
}
