import { getProvider } from "./providers";

export async function syncEvents(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchEvents) return `${competition.name}: events non supportés`;
  if (competition.ext?.coverage && competition.ext.coverage.fixtures?.events === false) return `${competition.name}: events non couverts`;

  const cap = Math.max(1, Math.min(Number(ctx.eventsCap || ctx.matchCap) || 3, 40));
  let todo = [];
  if (ctx.mode === "live") {
    const { data: live, error: liveError } = await db.from("matches").select("id,external_id").eq("competition_id", competition.id).eq("status", "live").not("external_id", "is", null).limit(cap);
    if (liveError) throw liveError;
    const previousIds = (ctx.liveMatchIds || []).filter(Boolean);
    let previous = [];
    if (previousIds.length) {
      const { data, error } = await db.from("matches").select("id,external_id").eq("competition_id", competition.id).in("id", previousIds).not("external_id", "is", null);
      if (error) throw error;
      previous = data || [];
    }
    todo = [...new Map([...(live || []), ...previous].map((match) => [match.id, match])).values()].slice(0, cap);
    if (!todo.length) return `${competition.name}: aucun événement live à demander`;
  } else {
    // Matchs terminés SANS événements encore importés (incrémental).
    const { data: finished, error: finishedError } = await db.from("matches").select("id,external_id").eq("competition_id", competition.id).eq("status", "finished").limit(300);
    if (finishedError) throw finishedError;
    const { data: withEv, error: eventSelectError } = await db.from("match_events").select("match_id").eq("source", competition.provider);
    if (eventSelectError) throw eventSelectError;
    const done = new Set((withEv || []).map((event) => event.match_id));
    todo = (finished || []).filter((match) => !done.has(match.id)).slice(0, cap);
    if (!todo.length) return `${competition.name}: events déjà à jour`;
  }

  const clubMap = Object.fromEntries((await db.from("clubs").select("id,external_id").eq("source", competition.provider)).data?.map((c) => [c.external_id, c.id]) || []);
  const playerMap = Object.fromEntries((await db.from("players").select("id,external_id").eq("source", competition.provider)).data?.map((p) => [p.external_id, p.id]) || []);

  let n = 0;
  for (const m of todo) {
    const evs = await provider.fetchEvents({ external_id: m.external_id }, ctx);
    const { error: deleteError } = await db.from("match_events").delete().eq("match_id", m.id).eq("source", competition.provider);
    if (deleteError) throw deleteError;
    if (evs.length) {
      const { error: insertError } = await db.from("match_events").insert(evs.map((e) => ({
        match_id: m.id, minute: e.minute, type: e.type,
        player_id: playerMap[e.player_ext] || null, club_id: clubMap[e.team_ext] || null, source: competition.provider,
        player_name: e.player_name || null, assist_name: e.assist_name || null, detail: e.detail || null,
      })));
      if (insertError) throw insertError;
    }
    n += evs.length;
  }
  return `${competition.name}: ${todo.length} match${todo.length > 1 ? "s" : ""}, ${n} événements${ctx.mode === "live" ? " live" : ""}`;
}
