import { getProvider } from "./providers";

export async function syncSquads(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchSquadPlayers) return `${competition.name}: squad non supporté`;
  if (competition.ext?.coverage && competition.ext.coverage.players === false) return `${competition.name}: joueurs non couverts`;

  // clubs réellement présents dans cette compétition (via ses matchs)
  const { data: ms } = await db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
  const clubIds = [...new Set((ms || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
  if (!clubIds.length) return `${competition.name}: aucun club (fais d'abord l'import)`;
  const { data: clubs } = await db.from("clubs").select("id,external_id").in("id", clubIds);

  const now = new Date().toISOString();
  let n = 0;
  for (const club of clubs || []) {
    const players = await provider.fetchSquadPlayers({ external_id: club.external_id }, ctx);
    for (const p of players) {
      const { data: existing } = await db.from("players").select("id,locked").eq("source", competition.provider).eq("external_id", p.external_id).maybeSingle();
      if (existing?.locked) continue;
      const patch = { source: competition.provider, external_id: p.external_id, name: p.name, nationality: p.nationality, position: p.position, photo_url: p.photo_url, age: p.age, birth_date: p.birth_date, club_id: club.id, competition: competition.name, synced_at: now };
      if (existing) await db.from("players").update(patch).eq("id", existing.id);
      else await db.from("players").insert({ ...patch, tracked: false, active: true });
      n++;
    }
  }
  return `${competition.name}: ${n} joueurs`;
}
