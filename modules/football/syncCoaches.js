import { getProvider } from "./providers";
import { upsertExternal } from "./sync";

export async function syncCoaches(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchCurrentCoach) return `${competition.name}: entraîneurs non supportés`;

  const season = (String(ctx.season ?? competition.ext?.season ?? "").match(/\d{4}/) || [])[0] || String(new Date().getFullYear());
  const { data: seasonRows, error: seasonsError } = await db.from("seasons").select("id,label").eq("competition_id", competition.id);
  if (seasonsError) throw seasonsError;
  const seasonRow = (seasonRows || []).find((row) => String(row.label || "").includes(season));
  let matchesQuery = db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
  if (seasonRow?.id) matchesQuery = matchesQuery.eq("season_id", seasonRow.id);
  const { data: matches, error: matchesError } = await matchesQuery;
  if (matchesError) throw matchesError;
  const clubIds = [...new Set((matches || []).flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
  if (!clubIds.length) return `${competition.name}: aucun club (fais d'abord l'import)`;
  const { data: clubs } = await db.from("clubs").select("id,name,external_id").in("id", clubIds).order("id");

  let updated = 0; let protectedCount = 0; let missing = 0;
  const orderedClubs = clubs || [];
  const startClubIndex = Math.max(0, Number(ctx.startClubIndex) || 0);
  for (let clubIndex = startClubIndex; clubIndex < orderedClubs.length; clubIndex++) {
    const club = orderedClubs[clubIndex];
    if (!club.external_id) { missing++; await ctx.saveClubCheckpoint?.(clubIndex + 1); continue; }
    const { data: manual } = await db.from("coaches").select("id").eq("club_id", club.id).eq("locked", true).limit(1);
    if (manual?.length) { protectedCount++; await ctx.saveClubCheckpoint?.(clubIndex + 1); continue; }

    const coach = await provider.fetchCurrentCoach(club, ctx);
    if (!coach) { missing++; await ctx.saveClubCheckpoint?.(clubIndex + 1); continue; }
    await upsertExternal(db, "coaches", competition.provider, [{ ...coach, club_id: club.id }], ["name", "photo_url", "club_id"]);
    await db.from("coaches").update({ club_id: null }).eq("source", competition.provider).eq("club_id", club.id).neq("external_id", coach.external_id).eq("locked", false);
    updated++;
    await ctx.saveClubCheckpoint?.(clubIndex + 1);
  }
  return `${competition.name}: ${updated} entraîneurs, ${protectedCount} protégés, ${missing} introuvables`;
}
