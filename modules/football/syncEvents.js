import { getProvider } from "./providers";
import { seasonLabel } from "./season";

export async function syncEvents(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider?.fetchEvents) return `${competition.name}: events non supportés`;
  if (competition.ext?.coverage && competition.ext.coverage.fixtures?.events === false) return `${competition.name}: events non couverts`;
  const selectedSeason = seasonLabel(ctx.season);
  const { data: season, error: seasonError } = await db.from("seasons").select("id").eq("competition_id", competition.id).eq("label", selectedSeason).maybeSingle();
  if (seasonError) throw seasonError;
  if (!season) return `${competition.name}: saison ${selectedSeason} introuvable`;

  const cap = Math.max(1, Math.min(Number(ctx.eventsCap || ctx.matchCap) || 3, 40));
  let todo = [];
  if (ctx.mode === "live") {
    const { data: live, error: liveError } = await db.from("matches").select("id,external_id,status").eq("competition_id", competition.id).eq("season_id", season.id).eq("status", "live").not("external_id", "is", null).limit(cap);
    if (liveError) throw liveError;
    const previousIds = (ctx.liveMatchIds || []).filter(Boolean);
    let previous = [];
    if (previousIds.length) {
      const { data, error } = await db.from("matches").select("id,external_id,status").eq("competition_id", competition.id).eq("season_id", season.id).in("id", previousIds).not("external_id", "is", null);
      if (error) throw error;
      previous = data || [];
    }
    todo = [...new Map([...(live || []), ...previous].map((match) => [match.id, match])).values()].slice(0, cap);
    if (!todo.length) return `${competition.name}: aucun événement live à demander`;
  } else {
    // Le marqueur couvre aussi une réponse provider vide : elle ne sera pas
    // refacturée au prochain passage.
    const { data: finished, error: finishedError } = await db.from("matches").select("id,external_id,status,events_synced_at").eq("competition_id", competition.id).eq("season_id", season.id).eq("status", "finished").not("external_id", "is", null).order("kickoff", { ascending: false }).limit(300);
    if (finishedError) throw finishedError;
    todo = (finished || []).filter((match) => !match.events_synced_at).slice(0, cap);
    if (!todo.length) return `${competition.name}: events déjà à jour`;
  }

  const clubMap = Object.fromEntries((await db.from("clubs").select("id,external_id").eq("source", competition.provider)).data?.map((c) => [c.external_id, c.id]) || []);
  const playerMap = Object.fromEntries((await db.from("players").select("id,external_id").eq("source", competition.provider)).data?.map((p) => [p.external_id, p.id]) || []);

  let n = 0;
  for (const m of todo) {
    const evs = await provider.fetchEvents({ external_id: m.external_id }, ctx);
    const rows = evs.map((e) => ({
      minute: e.minute, type: e.type,
      player_id: playerMap[e.player_ext] || null, club_id: clubMap[e.team_ext] || null,
      player_name: e.player_name || null, assist_name: e.assist_name || null, detail: e.detail || null,
    }));
    const { error: replaceError } = await db.rpc("replace_provider_match_events", {
      target_match_id: m.id,
      target_source: competition.provider,
      event_rows: rows,
      target_synced_at: new Date().toISOString(),
      mark_complete: m.status === "finished",
    });
    if (replaceError) throw replaceError;
    n += evs.length;
  }
  return `${competition.name}: ${todo.length} match${todo.length > 1 ? "s" : ""}, ${n} événements${ctx.mode === "live" ? " live" : ""}`;
}
