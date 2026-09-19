import { getProvider } from "./providers";
import { upsertExternal } from "./sync";
import { seasonLabel, seasonYear } from "./season";
import { upsertPlayerMembership } from "./playerMemberships";

export async function resolveNationalPlayerClubs(db, ctx = {}) {
  const providerKey = "apifootball";
  const provider = getProvider(providerKey);
  if (!provider?.fetchPlayerClubSeason) throw new Error("Résolution des clubs non supportée");
  const teamExternalId = String(ctx.teamExternalId || "").trim();
  if (!teamExternalId) throw new Error("Renseigne l’ID API-Football de la sélection");
  const selectedSeason = seasonLabel(ctx.season);
  const season = seasonYear(selectedSeason);
  const cap = Math.max(1, Math.min(Number(ctx.matchCap) || 3, 20));

  const { data: nationalTeam, error: teamError } = await db.from("clubs").select("id,name").eq("source", providerKey).eq("external_id", teamExternalId).eq("team_type", "national").maybeSingle();
  if (teamError) throw teamError;
  if (!nationalTeam) throw new Error("Synchronise d’abord cette sélection");

  const { data: callups, error: callupsError } = await db.from("national_team_callups").select("player_id").eq("national_team_id", nationalTeam.id).eq("season", selectedSeason).eq("active", true);
  if (callupsError) throw callupsError;
  const playerIds = [...new Set((callups || []).map((row) => row.player_id))];
  if (!playerIds.length) return `${nationalTeam.name}: aucune convocation active pour ${selectedSeason}`;
  const { data: players, error: playersError } = await db.from("players").select("id,name,external_id,club_id,country,competition,position,locked,tracked").in("id", playerIds);
  if (playersError) throw playersError;
  const candidates = (players || []).filter((player) => player.external_id && !player.locked && (!player.club_id || !player.country || !player.competition)).slice(0, cap);
  if (!candidates.length) return `${nationalTeam.name}: tous les clubs sont déjà renseignés`;

  let resolved = 0;
  const unresolved = [];
  for (const player of candidates) {
    const info = await provider.fetchPlayerClubSeason(player, { ...ctx, season, nationalTeamExternalId: teamExternalId });
    if (!info?.club) { unresolved.push(player.name); continue; }
    await upsertExternal(db, "clubs", providerKey, [info.club], ["name", "logo_url"]);
    const { data: club, error: clubError } = await db.from("clubs").select("id,name,team_type,parent_club_id").eq("source", providerKey).eq("external_id", info.club.external_id).maybeSingle();
    if (clubError || !club) throw clubError || new Error(`${info.club.name}: club local introuvable`);
    const { error: updateError } = await db.from("players").update({
      club_id: club.id,
      country: info.country,
      competition: info.competition,
      position: player.position || info.position,
      tracked: true,
      synced_at: new Date().toISOString(),
    }).eq("id", player.id);
    if (updateError) throw new Error(`${player.name}: ${updateError.message}`);
    await upsertPlayerMembership(db, {
      playerId: player.id,
      club,
      season,
      source: providerKey,
      externalId: player.external_id,
      position: player.position || info.position,
      syncedAt: new Date().toISOString(),
    });
    resolved++;
  }
  return `${nationalTeam.name}: ${resolved}/${candidates.length} club(s) complété(s)${unresolved.length ? ` · sans résultat : ${unresolved.join(", ")}` : ""}`;
}
