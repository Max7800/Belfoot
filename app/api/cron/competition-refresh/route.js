import { runJob } from "@/lib/jobs";
import { getAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rafraîchit automatiquement les COMPÉTITIONS de clubs (matchs, scores finaux, classements,
// nouvelles journées) avec une fenêtre de match intelligente : ~1×/jour au repos, plus
// souvent les jours de match. Chaque rafraîchissement = football.sync (~4 appels). Les
// scores minute par minute restent gérés par le cron live-window ; ici on tient à jour les
// résultats et donc les classements (recalculés depuis les matchs). Le plan d'import borne
// naturellement le périmètre : une compétition non autorisée pour la saison est ignorée.
const DEFAULTS = {
  window_before_hours: 36, // match à venir dans 36 h ⇒ jour de match
  window_after_hours: 6, // match terminé il y a < 6 h ⇒ encore chaud (scores finaux)
  refresh_window_hours: 6, // jour de match : re-sync si dernier full-sync > 6 h
  refresh_idle_hours: 20, // sinon : ~1×/jour
  max_competitions_per_tick: 8,
  per_sync_calls: 6,
  reserved_calls: 120,
};

function authorized(request) {
  const direct = request.headers.get("x-jobs-secret");
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const allowed = [process.env.JOBS_SECRET, process.env.CRON_SECRET].filter(Boolean);
  return allowed.length > 0 && (allowed.includes(direct) || allowed.includes(bearer));
}

function currentSeasonLabel(now) {
  const year = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}-${start + 1}`;
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export async function GET(request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const db = getAdmin();
  const now = new Date();
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  try {
    const { data: settings } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
    const strategy = { ...DEFAULTS, ...(settings?.data?.football_competition_refresh || {}) };
    const windowBefore = clamp(strategy.window_before_hours, 6, 168, DEFAULTS.window_before_hours);
    const windowAfter = clamp(strategy.window_after_hours, 1, 24, DEFAULTS.window_after_hours);
    const refreshWindow = clamp(strategy.refresh_window_hours, 1, 24, DEFAULTS.refresh_window_hours);
    const refreshIdle = clamp(strategy.refresh_idle_hours, 6, 72, DEFAULTS.refresh_idle_hours);
    const maxCompetitions = clamp(strategy.max_competitions_per_tick, 1, 30, DEFAULTS.max_competitions_per_tick);
    const perSyncCalls = clamp(strategy.per_sync_calls, 3, 20, DEFAULTS.per_sync_calls);
    const reservedCalls = clamp(strategy.reserved_calls, perSyncCalls, 2000, DEFAULTS.reserved_calls);
    const season = currentSeasonLabel(now);

    // On ne touche qu'aux compétitions de clubs visibles : les sélections sont gérées par
    // le cron national-refresh (scope international).
    const { data: comps, error: compError } = await db.from("competitions")
      .select("id,name")
      .not("provider", "is", null)
      .neq("public_visible", false)
      .neq("competition_scope", "international");
    if (compError) throw compError;
    if (!comps?.length) return Response.json({ ok: true, skipped: true, reason: "Aucune compétition éligible", estimatedCalls: 0 });

    const compIds = comps.map((competition) => competition.id);
    const lastFull = settings?.data?.football_competition_refresh_state || {};

    // Fenêtre « jour de match » : une compétition est chaude si elle a un match proche ou en direct.
    const from = new Date(now.getTime() - windowAfter * 3600000).toISOString();
    const to = new Date(now.getTime() + windowBefore * 3600000).toISOString();
    const [upcomingResult, liveResult] = await Promise.all([
      db.from("matches").select("competition_id").in("competition_id", compIds).gte("kickoff", from).lte("kickoff", to),
      db.from("matches").select("competition_id").in("competition_id", compIds).eq("status", "live"),
    ]);
    if (upcomingResult.error) throw upcomingResult.error;
    if (liveResult.error) throw liveResult.error;
    const inWindow = new Set([...(upcomingResult.data || []), ...(liveResult.data || [])].map((match) => match.competition_id));

    const due = [];
    for (const competition of comps) {
      const windowActive = inWindow.has(competition.id);
      const last = lastFull[competition.id] ? new Date(lastFull[competition.id]).getTime() : 0;
      const ageHours = (now.getTime() - last) / 3600000;
      if (ageHours >= (windowActive ? refreshWindow : refreshIdle)) due.push({ competition, windowActive, ageHours });
    }
    due.sort((a, b) => Number(b.windowActive) - Number(a.windowActive) || b.ageHours - a.ageHours);
    const picked = due.slice(0, maxCompetitions);

    if (dryRun) {
      return Response.json({
        ok: true, dryRun: true, season, window: { from, to },
        eligible: comps.length, inWindow: [...inWindow].length, due: due.length,
        picked: picked.map((item) => ({ competition: item.competition.name, windowActive: item.windowActive, ageHours: Math.round(item.ageHours) })),
      });
    }

    let used = 0;
    const results = [];
    const nextState = { ...lastFull };
    for (const { competition, windowActive } of picked) {
      if (used + perSyncCalls > reservedCalls) break;
      try {
        const result = await runJob("football.sync", {
          db,
          competitionId: competition.id,
          season,
          requestLimit: perSyncCalls,
          apifootballKey: process.env.APIFOOTBALL_KEY,
          thesportsdbKey: process.env.THESPORTSDB_KEY,
        });
        used += perSyncCalls;
        nextState[competition.id] = now.toISOString();
        results.push({ competition: competition.name, windowActive, ok: true, result });
      } catch (error) {
        // Compétition non autorisée par le plan ou en erreur : on n'avance pas son horodatage
        // (on réessaiera), et on ne casse pas le cron.
        results.push({ competition: competition.name, windowActive, ok: false, error: String(error?.message || error).slice(0, 300) });
      }
    }

    // Persiste l'horodatage du dernier full-sync par compétition (sans écraser le reste).
    if (results.some((result) => result.ok)) {
      const { data: fresh } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
      const { error: saveError } = await db.from("site_settings")
        .update({ data: { ...(fresh?.data || {}), football_competition_refresh_state: nextState } })
        .eq("id", 1);
      if (saveError) throw saveError;
    }

    return Response.json({
      ok: results.length === 0 || results.some((result) => result.ok),
      season, window: { from, to },
      eligible: comps.length, due: due.length, refreshed: results.filter((result) => result.ok).length,
      estimatedCalls: used, results,
    }, { status: results.length === 0 || results.some((result) => result.ok) ? 200 : 500 });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 500) }, { status: 500 });
  }
}

export const POST = GET;
