import { runJob } from "@/lib/jobs";
import { getAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
// Vercel Hobby : 60 s max par Function. Le travail réel est borné (lots + budget).
export const maxDuration = 60;

// Rafraîchit les sélections nationales SUIVIES avec une « fenêtre de match intelligente » :
// ~1×/jour au repos, et bien plus souvent pendant un rassemblement (match proche). Chaque
// rafraîchissement = football.national-team (3 appels : fiche + matchs + effectif), ce qui
// fait aussi apparaître les nouvelles compétitions quand le calendrier s'enchaîne et nettoie
// les convocations obsolètes. Les scores en direct restent gérés par le cron live-window,
// que ce cron alimente en activant le direct sur les compétitions à match imminent.
const DEFAULTS = {
  window_before_hours: 48, // match à venir dans les 48 h ⇒ en rassemblement
  window_after_hours: 4, // match terminé il y a < 4 h ⇒ encore chaud
  refresh_window_hours: 4, // en fenêtre : re-sync si dernier sync > 4 h
  refresh_idle_hours: 20, // hors fenêtre : ~1×/jour
  live_lead_hours: 6, // passe la compétition en direct dès 6 h après…
  live_trail_hours: 72, // …et jusqu'à 72 h avant un match de sélection suivie
  max_selections_per_tick: 6,
  reserved_calls: 60,
};

function authorized(request) {
  const direct = request.headers.get("x-jobs-secret");
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const allowed = [process.env.JOBS_SECRET, process.env.CRON_SECRET].filter(Boolean);
  return allowed.length > 0 && (allowed.includes(direct) || allowed.includes(bearer));
}

function currentSeasonLabel(now) {
  const year = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? year : year - 1; // saison démarre en juillet
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
    const strategy = { ...DEFAULTS, ...(settings?.data?.football_national_refresh || {}) };
    const windowBefore = clamp(strategy.window_before_hours, 6, 168, DEFAULTS.window_before_hours);
    const windowAfter = clamp(strategy.window_after_hours, 1, 24, DEFAULTS.window_after_hours);
    const refreshWindow = clamp(strategy.refresh_window_hours, 1, 24, DEFAULTS.refresh_window_hours);
    const refreshIdle = clamp(strategy.refresh_idle_hours, 6, 72, DEFAULTS.refresh_idle_hours);
    const maxSelections = clamp(strategy.max_selections_per_tick, 1, 20, DEFAULTS.max_selections_per_tick);
    const reservedCalls = clamp(strategy.reserved_calls, 3, 1000, DEFAULTS.reserved_calls);
    const season = currentSeasonLabel(now);

    const { data: teams, error: teamsError } = await db.from("clubs")
      .select("id,external_id,name,national_category,synced_at")
      .eq("team_type", "national").eq("national_followed", true).not("external_id", "is", null);
    if (teamsError) throw teamsError;
    if (!teams?.length) return Response.json({ ok: true, skipped: true, reason: "Aucune sélection suivie", estimatedCalls: 0 });

    const teamIds = teams.map((team) => team.id);
    const teamIn = teamIds.join(",");

    // Fenêtre « rassemblement » : une sélection est chaude si elle a un match dans
    // [now-afterH, now+beforeH], ou un match en direct.
    const from = new Date(now.getTime() - windowAfter * 3600000).toISOString();
    const to = new Date(now.getTime() + windowBefore * 3600000).toISOString();
    const teamFilter = `home_club_id.in.(${teamIn}),away_club_id.in.(${teamIn})`;
    const [upcomingResult, liveResult] = await Promise.all([
      db.from("matches").select("home_club_id,away_club_id").or(teamFilter).gte("kickoff", from).lte("kickoff", to),
      db.from("matches").select("home_club_id,away_club_id").or(teamFilter).eq("status", "live"),
    ]);
    if (upcomingResult.error) throw upcomingResult.error;
    if (liveResult.error) throw liveResult.error;
    const inWindow = new Set();
    for (const match of [...(upcomingResult.data || []), ...(liveResult.data || [])]) {
      if (teamIds.includes(match.home_club_id)) inWindow.add(match.home_club_id);
      if (teamIds.includes(match.away_club_id)) inWindow.add(match.away_club_id);
    }

    // Qui est « dû » : seuil de fraîcheur différent selon la fenêtre.
    const due = [];
    for (const team of teams) {
      const windowActive = inWindow.has(team.id);
      const last = team.synced_at ? new Date(team.synced_at).getTime() : 0;
      const ageHours = (now.getTime() - last) / 3600000;
      if (ageHours >= (windowActive ? refreshWindow : refreshIdle)) due.push({ team, windowActive, ageHours });
    }
    // Priorité : en fenêtre d'abord, puis les plus anciennement synchronisées.
    due.sort((a, b) => Number(b.windowActive) - Number(a.windowActive) || b.ageHours - a.ageHours);
    const picked = due.slice(0, maxSelections);

    if (dryRun) {
      return Response.json({
        ok: true, dryRun: true, season, window: { from, to },
        followed: teams.length, inWindow: [...inWindow].length, due: due.length,
        picked: picked.map((item) => ({ team: item.team.name, windowActive: item.windowActive, ageHours: Math.round(item.ageHours) })),
      });
    }

    let used = 0;
    const results = [];
    const callsPerSelection = 5; // fiche + matchs (2 saisons) + effectif, avec marge
    for (const { team, windowActive } of picked) {
      if (used + callsPerSelection > reservedCalls) break;
      try {
        const result = await runJob("football.national-team", {
          db,
          teamExternalId: team.external_id,
          nationalCategory: team.national_category || "senior",
          season,
          requestLimit: callsPerSelection,
          apifootballKey: process.env.APIFOOTBALL_KEY,
        });
        used += callsPerSelection;
        results.push({ team: team.name, windowActive, ok: true, result });
      } catch (error) {
        // Une sélection bloquée par le plan ou en erreur ne doit pas casser le cron.
        results.push({ team: team.name, windowActive, ok: false, error: String(error?.message || error).slice(0, 300) });
      }
    }

    // Direct : active le live_enabled des compétitions INTERNATIONALES avec un match de
    // sélection suivie proche, et le désactive sur celles sans match proche (ménage après
    // rassemblement). On ne touche qu'aux compétitions de sélections, jamais aux clubs.
    const liveToggle = await syncSelectionLiveFlags(db, teamIds, teamIn, now, strategy);

    return Response.json({
      ok: results.every((result) => result.ok),
      season, window: { from, to },
      followed: teams.length, due: due.length, refreshed: results.length,
      estimatedCalls: used, liveToggle, results,
    }, { status: results.length === 0 || results.some((result) => result.ok) ? 200 : 500 });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 500) }, { status: 500 });
  }
}

async function syncSelectionLiveFlags(db, teamIds, teamIn, now, strategy) {
  const lead = clamp(strategy.live_lead_hours, 1, 48, DEFAULTS.live_lead_hours);
  const trail = clamp(strategy.live_trail_hours, 6, 240, DEFAULTS.live_trail_hours);
  const { data: intlComps, error } = await db.from("competitions")
    .select("id,live_enabled").eq("competition_scope", "international");
  if (error) throw error;
  if (!intlComps?.length) return { enabled: 0, disabled: 0 };
  const intlIds = intlComps.map((competition) => competition.id);
  const from = new Date(now.getTime() - lead * 3600000).toISOString();
  const to = new Date(now.getTime() + trail * 3600000).toISOString();
  const teamFilter = `home_club_id.in.(${teamIn}),away_club_id.in.(${teamIn})`;
  const [upcomingResult, liveResult] = await Promise.all([
    db.from("matches").select("competition_id").in("competition_id", intlIds).or(teamFilter).gte("kickoff", from).lte("kickoff", to),
    db.from("matches").select("competition_id").in("competition_id", intlIds).or(teamFilter).eq("status", "live"),
  ]);
  if (upcomingResult.error) throw upcomingResult.error;
  if (liveResult.error) throw liveResult.error;
  const shouldBeLive = new Set([...(upcomingResult.data || []), ...(liveResult.data || [])].map((match) => match.competition_id));
  const toEnable = intlComps.filter((competition) => shouldBeLive.has(competition.id) && !competition.live_enabled).map((competition) => competition.id);
  const toDisable = intlComps.filter((competition) => !shouldBeLive.has(competition.id) && competition.live_enabled).map((competition) => competition.id);
  if (toEnable.length) { const { error: enableError } = await db.from("competitions").update({ live_enabled: true }).in("id", toEnable); if (enableError) throw enableError; }
  if (toDisable.length) { const { error: disableError } = await db.from("competitions").update({ live_enabled: false }).in("id", toDisable); if (disableError) throw disableError; }
  return { enabled: toEnable.length, disabled: toDisable.length };
}

export const POST = GET;
