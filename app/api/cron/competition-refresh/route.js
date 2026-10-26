import { runJob } from "@/lib/jobs";
import { getAdmin } from "@/lib/supabaseAdmin";
import { assertImportTargetAllowed } from "@/lib/importPlan";
import { JOB_CATALOG } from "@/lib/jobCatalog";
import { REFRESH_TIME_BUDGET_MS, refreshTargets } from "@/lib/competitionRefresh";
import { rolloverDue, watchedCompetitionIds } from "@/lib/campaignRollover";
import { updateSiteSettings } from "@/lib/siteSettings";

// Passage 3 (renouvellement des campagnes) : une compétition au plus par passage,
// une vérification par jour et par compétition, et seulement s'il reste de quoi
// finir une synchro avant la coupure à 60 s.
const ROLLOVER_START_BEFORE_MS = 12000;
const ROLLOVER_CALLS = 6;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rafraîchit automatiquement TOUTES les compétitions visibles (clubs et
// sélections), chacune sur sa saison publique (lib/competitionRefresh.js). Deux passages :
//  1) RÉSULTATS/CLASSEMENTS (football.sync) — fenêtre de match intelligente : ~1×/jour au
//     repos, plus souvent les jours de match. Le classement se recalcule depuis les matchs.
//  2) STATS JOUEURS / buteurs-passeurs (football.squads) — « après chaque jour de match » :
//     une compétition n'est rafraîchie que si elle a eu un match terminé depuis son dernier
//     refresh stats. Lourd (par club) → lot borné + reprise sur plusieurs ticks.
//     Réservé aux compétitions de clubs, et seulement si le plan d'import l'autorise.
// Les scores minute par minute restent gérés par live-window. Tout respecte le plan d'import
// (une compétition/saison non autorisée est écartée AVANT tout lancement, sans appel API).
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
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > REFRESH_TIME_BUDGET_MS;
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
    // Budget d'un lot ≥ coût maximal du lot (4 appels par club) : sinon le
    // préflight de football.squads refuse chaque lot et les stats ne bougent plus.
    const statsPerCall = clamp(strategy.stats_per_call, statsClubBatch * 4, 60, Math.max(DEFAULTS.stats_per_call, statsClubBatch * 4));
    const maxStatsPerTick = clamp(strategy.max_stats_per_tick, 1, 10, DEFAULTS.max_stats_per_tick);
    const reservedStatsCalls = clamp(strategy.reserved_stats_calls, statsPerCall, 2000, DEFAULTS.reserved_stats_calls);
    const calendarSeason = currentSeasonLabel(now);

    const { data: visible, error: compError } = await db.from("competitions")
      .select("id,name,provider,public_visible,competition_scope")
      .not("provider", "is", null)
      .neq("public_visible", false);
    if (compError) throw compError;
    const { data: seasonRows, error: seasonsError } = (visible || []).length
      ? await db.from("seasons").select("*").in("competition_id", visible.map((competition) => competition.id))
      : { data: [], error: null };
    if (seasonsError) throw seasonsError;
    const { targets, skipped } = refreshTargets(visible || [], seasonRows || []);
    // Plan d'import vérifié AVANT tout lancement : une cible non autorisée est
    // écartée sans créer de job ni consommer d'appel.
    const allowed = [];
    for (const target of targets) {
      const ctx = { competitionId: target.competition.id, season: target.season.label };
      try { await assertImportTargetAllowed(db, "football.sync", ctx, JOB_CATALOG["football.sync"]); }
      catch (error) { skipped.push({ competition: target.competition.name, reason: String(error?.message || error).slice(0, 200) }); continue; }
      let statsAllowed = target.statsEligible;
      if (statsAllowed) {
        try { await assertImportTargetAllowed(db, "football.squads", ctx, JOB_CATALOG["football.squads"]); }
        catch { statsAllowed = false; }
      }
      allowed.push({ ...target, statsAllowed });
    }
    const comps = allowed.map((target) => target.competition);
    // Sans compétition visible à rafraîchir, le passage de renouvellement reste
    // nécessaire si des compétitions sont SURVEILLÉES.
    if (!comps.length && !watchedCompetitionIds(settings?.data?.football_import_plan).length) return Response.json({ ok: true, skipped: true, reason: "Aucune compétition éligible", estimatedCalls: 0, excluded: skipped });
    const seasonOf = Object.fromEntries(allowed.map((target) => [target.competition.id, target.season]));
    const statsAllowedFor = new Set(allowed.filter((target) => target.statsAllowed).map((target) => target.competition.id));

    const compIds = comps.map((competition) => competition.id);
    const compName = Object.fromEntries(comps.map((competition) => [competition.id, competition.name]));
    const refreshState = { ...(settings?.data?.football_competition_refresh_state || {}) };
    const statsState = { ...(settings?.data?.football_competition_stats_state || {}) };
    const rolloverState = { ...(settings?.data?.football_campaign_rollover_state || {}) };

    // ── Fenêtre « jour de match » (passage 1) ────────────────────────────────
    const from = new Date(now.getTime() - windowAfter * 3600000).toISOString();
    const to = new Date(now.getTime() + windowBefore * 3600000).toISOString();
    const statsFrom = new Date(now.getTime() - statsLookbackDays * 86400000).toISOString();
    const seasonIds = allowed.map((target) => target.season.id);
    const [upcomingResult, liveResult, finishedResult] = await Promise.all([
      db.from("matches").select("competition_id,season_id").in("season_id", seasonIds).gte("kickoff", from).lte("kickoff", to),
      db.from("matches").select("competition_id,season_id").in("season_id", seasonIds).eq("status", "live"),
      db.from("matches").select("competition_id,season_id,kickoff").in("season_id", seasonIds).eq("status", "finished").gte("kickoff", statsFrom),
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
      if (!statsAllowedFor.has(competition.id)) continue;
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
        ok: true, dryRun: true, calendarSeason, window: { from, to },
        eligible: comps.length, inWindow: [...inWindow].length, excluded: skipped,
        seasons: Object.fromEntries(allowed.map((target) => [target.competition.name, target.season.label])),
        results: { due: dueResults.length, picked: pickedResults.map((item) => ({ competition: item.competition.name, season: seasonOf[item.competition.id].label, windowActive: item.windowActive, ageHours: Math.round(item.ageHours) })) },
        stats: { due: dueStats.length, picked: pickedStats.map((item) => ({ competition: item.competition.name, resuming: item.resuming, clubIndex: Number(statsState[item.competition.id]?.clubIndex) || 0 })) },
      });
    }

    // État enregistré après chaque réussite, écriture conditionnée par la
    // révision (lib/siteSettings.js) : rien d'autre dans site_settings n'est
    // écrasé, même si l'admin ou le job de renouvellement écrit en même temps.
    const persistState = () => updateSiteSettings(db, { football_competition_refresh_state: refreshState, football_competition_stats_state: statsState, football_campaign_rollover_state: rolloverState });

    let used = 0;
    let timeLimited = 0;
    const results = [];
    for (const { competition, windowActive } of pickedResults) {
      if (used + perSyncCalls > reservedCalls) break;
      if (outOfTime()) { timeLimited = pickedResults.length - results.filter((r) => r.pass === "results").length; break; }
      try {
        const result = await runJob("football.sync", { db, competitionId: competition.id, season: seasonOf[competition.id].label, requestLimit: perSyncCalls, apifootballKey: process.env.APIFOOTBALL_KEY, thesportsdbKey: process.env.THESPORTSDB_KEY });
        used += perSyncCalls;
        refreshState[competition.id] = now.toISOString();
        results.push({ pass: "results", competition: competition.name, season: seasonOf[competition.id].label, windowActive, ok: true, result });
        await persistState();
      } catch (error) {
        results.push({ pass: "results", competition: competition.name, windowActive, ok: false, error: String(error?.message || error).slice(0, 300) });
      }
    }

    let statsUsed = 0;
    for (const { competition } of pickedStats) {
      if (statsUsed + statsPerCall > reservedStatsCalls) break;
      if (outOfTime()) break;
      const state = statsState[competition.id] || {};
      const startClubIndex = Number(state.clubIndex) || 0;
      try {
        const result = await runJob("football.squads", {
          db, competitionId: competition.id, season: seasonOf[competition.id].label,
          clubBatchSize: statsClubBatch, requestLimit: statsPerCall,
          resumeState: { competitionIndex: 0, clubIndex: startClubIndex },
          apifootballKey: process.env.APIFOOTBALL_KEY,
        });
        statsUsed += statsPerCall;
        const complete = typeof result !== "object" || result.complete !== false;
        if (complete) statsState[competition.id] = { lastStatsAt: now.toISOString(), clubIndex: 0 };
        else statsState[competition.id] = { lastStatsAt: state.lastStatsAt || null, clubIndex: Number(result.progress?.current) || startClubIndex };
        results.push({ pass: "stats", competition: competition.name, ok: true, complete, progress: result?.progress || null });
        await persistState();
      } catch (error) {
        results.push({ pass: "stats", competition: competition.name, ok: false, error: String(error?.message || error).slice(0, 300) });
      }
    }


    // ── Passage 3 : renouvellement automatique des campagnes ────────────────
    // Jusqu'à « prête » seulement : l'activation reste un clic de l'administrateur.
    let rollover = null;
    if (Date.now() - startedAt <= ROLLOVER_START_BEFORE_MS) {
      // Compétitions visibles suivies + compétitions SURVEILLÉES (même masquées,
      // même sans saison publiée) : nouvelles campagnes importées jusqu'à « prête ».
      const followedIds = new Set(comps.map((competition) => competition.id));
      const watchedIds = watchedCompetitionIds(settings?.data?.football_import_plan).filter((id) => !followedIds.has(id));
      let watched = [];
      if (watchedIds.length) {
        const { data: watchedRows, error: watchedError } = await db.from("competitions").select("id,name,provider,external_id,public_visible").in("id", watchedIds);
        if (watchedError) throw watchedError;
        watched = (watchedRows || []).filter((competition) => competition.provider);
      }
      const candidate = [...comps, ...watched].filter((competition) => rolloverDue(rolloverState[competition.id], now.getTime()))
        .sort((a, b) => (Date.parse(rolloverState[a.id]?.checkedAt || "") || 0) - (Date.parse(rolloverState[b.id]?.checkedAt || "") || 0))[0];
      if (candidate) {
        let outcome;
        try {
          const result = await runJob("football.campaign-rollover", { db, competitionId: candidate.id, requestLimit: ROLLOVER_CALLS, apifootballKey: process.env.APIFOOTBALL_KEY });
          outcome = { ok: true, status: result?.meta?.status || null, label: result?.meta?.label || null, detail: String(result?.detail || "").slice(0, 300) };
        } catch (error) {
          outcome = { ok: false, error: String(error?.message || error).slice(0, 300) };
        }
        // Tentative mémorisée même en échec : pas de nouvel essai avant 24 h
        // (72 h si le calendrier de la campagne était attendu).
        rolloverState[candidate.id] = { checkedAt: now.toISOString(), ...outcome };
        rollover = { competition: candidate.name, ...outcome };
        await persistState();
      }
    }

    return Response.json({
      ok: results.length === 0 || results.some((result) => result.ok),
      calendarSeason,
      rollover,
      eligible: comps.length,
      excluded: skipped,
      results: { due: dueResults.length, refreshed: results.filter((r) => r.pass === "results" && r.ok).length, calls: used, postponedForTime: timeLimited },
      stats: { due: dueStats.length, advanced: results.filter((r) => r.pass === "stats" && r.ok).length, calls: statsUsed },
      log: results,
    }, { status: results.length === 0 || results.some((result) => result.ok) ? 200 : 500 });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 500) }, { status: 500 });
  }
}

export const POST = GET;
