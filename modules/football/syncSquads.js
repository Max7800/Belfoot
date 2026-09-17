import { getProvider } from "./providers";

export async function syncSquads(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchSquadPlayers) return `${competition.name}: squad non supporté`;
  if (competition.ext?.coverage && competition.ext.coverage.players === false) return `${competition.name}: joueurs non couverts`;

  const season = (String(ctx.season ?? competition.ext?.season ?? "").match(/\d{4}/) || [])[0] || String(new Date().getFullYear());
  const { data: ms } = await db.from("matches").select("home_club_id,away_club_id").eq("competition_id", competition.id);
  const clubIds = [...new Set((ms || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
  if (!clubIds.length) return `${competition.name}: aucun club (fais d'abord l'import)`;
  const { data: clubs } = await db.from("clubs").select("id,external_id").in("id", clubIds);

  const now = new Date().toISOString();
  let n = 0;
  for (const club of clubs || []) {
    const players = await provider.fetchSquadPlayers({ external_id: club.external_id }, { ...ctx, season, leagueId: competition.external_id });
    for (const p of players) {
      const { data: existing } = await db.from("players").select("id,locked").eq("source", competition.provider).eq("external_id", p.external_id).maybeSingle();
      if (existing?.locked) continue;
      const patch = { source: competition.provider, external_id: p.external_id, name: p.name, nationality: p.nationality, position: p.position, photo_url: p.photo_url, age: p.age, birth_date: p.birth_date, club_id: club.id, country: competition.ext?.country || null, competition: competition.name, tracked: true, synced_at: now };
      let pid = existing?.id;
      if (existing) await db.from("players").update(patch).eq("id", existing.id);
      else { const { data: ins } = await db.from("players").insert({ ...patch, active: true }).select("id").single(); pid = ins?.id; }
      if (pid && p.stats) {
        const { error } = await db.from("player_season_stats").upsert({ player_id: pid, competition_id: competition.id, season, ...p.stats, source: competition.provider, external_id: p.external_id, synced_at: now }, { onConflict: "player_id,competition_id,season" });
        if (error) throw new Error(`${competition.name}: stats ${p.name}: ${error.message}`);
      }
      n++;
    }
  }
  return `${competition.name}: ${n} joueurs (+ stats saison)`;
}
