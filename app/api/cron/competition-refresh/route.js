import { runJob } from "@/lib/jobs";
import { getAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rafraîchit automatiquement les COMPÉTITIONS de clubs. Deux passages :
//  1) RÉSULTATS/CLASSEMENTS (football.sync) — fenêtre de match intelligente : ~1×/jour au
//     repos, plus souvent les jours de match. Le classement se recalcule depuis les matchs.
//  2) STATS JOUEURS / buteurs-passeurs (football.squads) — « après chaque jour de match » :
//     une compétition n'est rafraîchie que si elle a eu un match terminé depuis son dernier
//     refresh stats. Lourd (par club) → lot borné + reprise sur plusieurs ticks.
// Les scores minute par minute restent gérés par live-window. Tout respecte le plan d'import
// (une compétition/saison non autorisée est simplement ignorée).
const DEFAULTS = {
  window_before_hours: 36,
  window_after_hours: 6,
  refresh_window_hours: 6,
  refresh_idle_hours: 20,
  max_competitions_per_tick: 8,
  per_sync_calls: 6,
  reserved_calls: 120,
  // Passage stats
  stats_lookback_days: 30, // fenêtre pour détecter « un match a eu lieu depuis le dernier refresh »
  stats_club_batch: 3, // clubs par tick (endpoint squad lent)
  stats_per_call: 12, // budget d'un lot squads
  max_stats_per_tick: 2, // compétitions dont on avance les stats par tick
  reserved_stats_calls: 120,
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
    const statsLookbackDays = clamp(strategy.stats_lookback_days, 1, 120, DEFAULTS.stats_lookback_days);
    const statsClubBatch = clamp(strategy.stats_club_batch, 1, 10, DEFAULTS.stats_club_batch);
    const statsPerCall = clamp(strategy.stats_per_call, 3, 60, DEFAULTS.stats_per_call);
    const maxStatsPerTick = clamp(strategy.max_stats_per_tick, 1, 10, DEFAULTS.max_stats_per_tick);
    const reservedStatsCalls = clamp(strategy.reserved_stats_calls, statsPerCall, 2000, DEFAULTS.reserved_stats_calls);
    const season = currentSeasonLabel(now);

    const { data: comps, error: compError } = await db.from("competitions")
      .select("id,name")
      .not("provider", "is", null)
      .neq("public_visible", false)
      .neq("competition_scope", "international");
    if (compError) throw compError;
    if (!comps?.length) return Response.json({ ok: true, skipped: true, reason: "Aucune compétition éligible", estimatedCalls: 0 });

    const compIds = comps.map((competition) => competition.id);
    const compName = Object.fromEntries(comps.map((competition) => [competition.id, competition.name]));
    const refreshState = { ...(settings?.data?.football_competition_refresh_state || {}) };
    const statsState = { ...(settings?.data?.football_competition_stats_state || {}) };

    // ── Fenêtre « jour de match » (passage 1) ────────────────────────────────
    const from = new Date(now.getTime() - windowAfter * 3600000).toISOString();
    const to = new Date(now.getTime() + windowBefore * 3600000).toISOString();
    const statsFrom = new Date(now.getTime() - statsLookbackDays * 86400000).toISOString();
    const [upcomingResult, liveResult, finishedResult] = await Promise.all([
      db.from("matches").select("competition_id").in("competition_id", compIds).gte("kickoff", from).lte("kickoff", to),
      db.from("matches").select("competition_id").in("competition_id", compIds).eq("status", "live"),
      db.from("matches").select("competition_id,kickoff").in("competition_id", compIds).eq("status", "finished").gte("kickoff", statsFrom),
    ]);
    if (upcomingResult.error) throw upcomingResult.error;
    if (liveResult.error) throw liveResult.error;
    if (finishedResult.error) throw finishedResult.error;
    const inWindow = new Set([...(upcomingResult.data || []), ...(liveResult.data || [])].map((match) => match.competition_id));
    const latestFinished = {};
    for (const match of finishedResult.data || []) {
      const time = new Date(match.kickoff).getTime();
      if (!latestFinished[match.competition_id] || time > latestFinished[match.competition_id]) latestFinished[match.competition_id] = time;
    }

    // ── Passage 1 : résultats / classements ──────────────────────────────────
    const dueResults = [];
    for (const competition of comps) {
      const windowActive = inWindow.has(competition.id);
      const last = refreshState[competition.id] ? new Date(refreshState[competition.id]).getTime() : 0;
      const ageHours = (now.getTime() - last) / 3600000;
      if (ageHours >= (windowActive ? refreshWindow : refreshIdle)) dueResults.push({ competition, windowActive, ageHours });
    }
    dueResults.sort((a, b) => Number(b.windowActive) - Number(a.windowActive) || b.ageHours - a.ageHours);

    // ── Passage 2 : stats joueurs « après jour de match » ────────────────────
    const dueStats = [];
    for (const competition of comps) {
      const state = statsState[competition.id] || {};
      const resuming = Number(state.clubIndex) > 0;
      const last = state.lastStatsAt ? new Date(state.lastStatsAt).getTime() : 0;
      const hasNewMatch = latestFinished[competition.id] && latestFinished[competition.id] > last;
      if (resuming || hasNewMatch) dueStats.push({ competition, resuming });
    }
    // Finir d'abord les reprises en cours, puis les nouvelles.
    dueStats.sort((a, b) => Number(b.resuming) - Number(a.resuming));

    const pickedResults = dueResults.slice(0, maxCompetitions);
    const pickedStats = dueStats.slice(0, maxStatsPerTick);

    if (dryRun) {
      return Response.json({
        ok: true, dryRun: true, season, window: { from, to },
        eligible: comps.length, inWindow: [...inWindow].length,
        results: { due: dueResults.length, picked: pickedResults.map((item) => ({ competition: item.competition.name, windowActive: item.windowActive, ageHours: Math.round(item.ageHours) })) },
        stats: { due: dueStats.length, picked: pickedStats.map((item) => ({ competition: item.competition.name, resuming: item.resuming, clubIndex: Number(statsState[item.competition.id]?.clubIndex) || 0 })) },
      });
    }

    let used = 0;
    const results = [];
    for (const { competition, windowActive } of pickedResults) {
      if (used + perSyncCalls > reservedCalls) break;
      try {
        const result = await runJob("football.sync", { db, competitionId: competition.id, season, requestLimit: perSyncCalls, apifootballKey: process.env.APIFOOTBALL_KEY, thesportsdbKey: process.env.THESPORTSDB_KEY });
        used += perSyncCalls;
        refreshState[competition.id] = now.toISOString();
        results.push({ pass: "results", competition: competition.name, windowActive, ok: true, result });
      } catch (error) {
        results.push({ pass: "results", competition: competition.name, windowActive, ok: false, error: String(error?.message || error).slice(0, 300) });
      }
    }

    let statsUsed = 0;
    for (const { competition } of pickedStats) {
      if (statsUsed + statsPerCall > reservedStatsCalls) break;
      const state = statsState[competition.id] || {};
      const startClubIndex = Number(state.clubIndex) || 0;
      try {
        const result = await runJob("football.squads", {
          db, competitionId: competition.id, season,
          clubBatchSize: statsClubBatch, requestLimit: statsPerCall,
          resumeState: { competitionIndex: 0, clubIndex: startClubIndex },
          apifootballKey: process.env.APIFOOTBALL_KEY,
        });
        statsUsed += statsPerCall;
        const complete = typeof result !== "object" || result.complete !== false;
        if (complete) statsState[competition.id] = { lastStatsAt: now.toISOString(), clubIndex: 0 };
        else statsState[competition.id] = { lastStatsAt: state.lastStatsAt || null, clubIndex: Number(result.progress?.current) || startClubIndex };
        results.push({ pass: "stats", competition: competition.name, ok: true, complete, progress: result?.progress || null });
      } catch (error) {
        results.push({ pass: "stats", competition: competition.name, ok: false, error: String(error?.message || error).slice(0, 300) });
      }
    }

    // Persiste les deux états en un seul écrit (sans écraser le reste de site_settings).
    if (results.some((result) => result.ok)) {
      const { data: fresh } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
      const { error: saveError } = await db.from("site_settings")
        .update({ data: { ...(fresh?.data || {}), football_competition_refresh_state: refreshState, football_competition_stats_state: statsState } })
        .eq("id", 1);
      if (saveError) throw saveError;
    }

    return Response.json({
      ok: results.length === 0 || results.some((result) => result.ok),
      season,
      eligible: comps.length,
      results: { due: dueResults.length, refreshed: results.filter((r) => r.pass === "results" && r.ok).length, calls: used },
      stats: { due: dueStats.length, advanced: results.filter((r) => r.pass === "stats" && r.ok).length, calls: statsUsed },
      log: results,
    }, { status: results.length === 0 || results.some((result) => result.ok) ? 200 : 500 });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 500) }, { status: 500 });
  }
}

export const POST = GET;
