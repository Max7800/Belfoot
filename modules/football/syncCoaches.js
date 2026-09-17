import { getProvider } from "./providers";
import { upsertExternal } from "./sync";

export async function syncCoaches(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchCurrentCoach) return `${competition.name}: entraîneurs non supportés`;

  const { data: matches } = await db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
  const clubIds = [...new Set((matches || []).flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
  if (!clubIds.length) return `${competition.name}: aucun club (fais d'abord l'import)`;
  const { data: clubs } = await db.from("clubs").select("id,name,external_id").in("id", clubIds);

  let updated = 0; let protectedCount = 0; let missing = 0;
  for (const club of clubs || []) {
    if (!club.external_id) { missing++; continue; }
    const { data: manual } = await db.from("coaches").select("id").eq("club_id", club.id).eq("locked", true).limit(1);
    if (manual?.length) { protectedCount++; continue; }

    const coach = await provider.fetchCurrentCoach(club, ctx);
    if (!coach) { missing++; continue; }
    await upsertExternal(db, "coaches", competition.provider, [{ ...coach, club_id: club.id }], ["name", "photo_url", "club_id"]);
    await db.from("coaches").update({ club_id: null }).eq("source", competition.provider).eq("club_id", club.id).neq("external_id", coach.external_id).eq("locked", false);
    updated++;
  }
  return `${competition.name}: ${updated} entraîneurs, ${protectedCount} protégés, ${missing} introuvables`;
}
