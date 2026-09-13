import { getProvider } from "./providers";

export async function discoverBelgians(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchSquadPlayers) return `${competition.name}: squad non supporté`;
  if (competition.ext?.coverage && competition.ext.coverage.players === false) return `${competition.name}: joueurs non couverts`;
  const nationality = ctx.nationality || "Belgium";
  const { data: clubs } = await db.from("clubs").select("id,external_id").eq("source", competition.provider);
  let found = 0;
  for (const club of clubs || []) {
    const players = await provider.fetchSquadPlayers({ external_id: club.external_id }, ctx);
    const belgians = players.filter((p) => (p.nationality || "").toLowerCase() === nationality.toLowerCase());
    for (const p of belgians) {
      const { data: existing } = await db.from("players").select("id,locked").eq("source", competition.provider).eq("external_id", p.external_id).maybeSingle();
      if (existing?.locked) continue;                       // saisie manuelle protégée
      const patch = { source: competition.provider, external_id: p.external_id, name: p.name, nationality: p.nationality, position: p.position, photo_url: p.photo_url, club_id: club.id, competition: competition.name, synced_at: new Date().toISOString() };
      if (existing) await db.from("players").update(patch).eq("id", existing.id);
      else await db.from("players").insert({ ...patch, tracked: false, active: true });   // découvert, pas encore suivi
      found++;
    }
  }
  return `${competition.name}: ${found} ${nationality}`;
}
