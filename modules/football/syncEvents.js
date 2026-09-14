import { getProvider } from "./providers";

export async function syncEvents(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchEvents) return `${competition.name}: events non supportés`;
  if (competition.ext?.coverage && competition.ext.coverage.fixtures?.events === false) return `${competition.name}: events non couverts`;

  const cap = ctx.eventsCap || 40;   // plafond de matchs traités par run (quota)
  // matchs terminés SANS événements encore importés (incrémental)
  const { data: finished } = await db.from("matches").select("id,external_id").eq("competition_id", competition.id).eq("status", "finished").limit(300);
  const { data: withEv } = await db.from("match_events").select("match_id").eq("source", competition.provider);
  const done = new Set((withEv || []).map((e) => e.match_id));
  const todo = (finished || []).filter((m) => !done.has(m.id)).slice(0, cap);
  if (!todo.length) return `${competition.name}: events déjà à jour`;

  const clubMap = Object.fromEntries((await db.from("clubs").select("id,external_id").eq("source", competition.provider)).data?.map((c) => [c.external_id, c.id]) || []);
  const playerMap = Object.fromEntries((await db.from("players").select("id,external_id").eq("source", competition.provider)).data?.map((p) => [p.external_id, p.id]) || []);

  let n = 0;
  for (const m of todo) {
    const evs = await provider.fetchEvents({ external_id: m.external_id }, ctx);
    await db.from("match_events").delete().eq("match_id", m.id).eq("source", competition.provider);
    if (evs.length) {
      await db.from("match_events").insert(evs.map((e) => ({
        match_id: m.id, minute: e.minute, type: e.type,
        player_id: playerMap[e.player_ext] || null, club_id: clubMap[e.team_ext] || null, source: competition.provider,
        player_name: e.player_name || null, assist_name: e.assist_name || null, detail: e.detail || null,
      })));
    }
    n += evs.length;
  }
  return `${competition.name}: ${todo.length} matchs, ${n} événements`;
}
