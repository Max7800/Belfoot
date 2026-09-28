import { runJob } from "@/lib/jobs";
import { getAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_STRATEGY = {
  window_before_minutes: 15,
  window_after_minutes: 180,
  max_concurrent_matches: 8,
  reserved_daily_calls: 300,
};

function authorized(request) {
  const direct = request.headers.get("x-jobs-secret");
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const allowed = [process.env.JOBS_SECRET, process.env.CRON_SECRET].filter(Boolean);
  return allowed.length > 0 && (allowed.includes(direct) || allowed.includes(bearer));
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
    const [{ data: settings }, { data: competitions, error: competitionError }] = await Promise.all([
      db.from("site_settings").select("data").eq("id", 1).maybeSingle(),
      db.from("competitions").select("id,name,provider").eq("live_enabled", true).not("provider", "is", null),
    ]);
    if (competitionError) throw competitionError;
    const strategy = { ...DEFAULT_STRATEGY, ...(settings?.data?.football_live_strategy || {}) };
    const beforeMinutes = clamp(strategy.window_before_minutes, 5, 120, DEFAULT_STRATEGY.window_before_minutes);
    const afterMinutes = clamp(strategy.window_after_minutes, 90, 300, DEFAULT_STRATEGY.window_after_minutes);
    const maxMatches = clamp(strategy.max_concurrent_matches, 1, 20, DEFAULT_STRATEGY.max_concurrent_matches);
    const competitionIds = (competitions || []).map((competition) => competition.id);
    if (!competitionIds.length) return Response.json({ ok: true, skipped: true, reason: "Aucune compétition activée pour le direct", estimatedCalls: 0 });

    const from = new Date(now.getTime() - afterMinutes * 60000).toISOString();
    const to = new Date(now.getTime() + beforeMinutes * 60000).toISOString();
    const { data: candidates, error: matchError } = await db.from("matches")
      .select("id,competition_id,season_id,kickoff,status")
      .in("competition_id", competitionIds)
      .in("status", ["scheduled", "live"])
      .gte("kickoff", from)
      .lte("kickoff", to)
      .order("kickoff", { ascending: true })
      .limit(maxMatches);
    if (matchError) throw matchError;
    if (!candidates?.length) return Response.json({ ok: true, skipped: true, reason: "Aucun match dans la fenêtre du direct", window: { from, to }, estimatedCalls: 0 });

    const seasonIds = [...new Set(candidates.map((match) => match.season_id).filter(Boolean))];
    const { data: seasons, error: seasonError } = seasonIds.length
      ? await db.from("seasons").select("id,label").in("id", seasonIds)
      : { data: [], error: null };
    if (seasonError) throw seasonError;
    const seasonMap = Object.fromEntries((seasons || []).map((season) => [season.id, season.label]));
    const competitionMap = Object.fromEntries((competitions || []).map((competition) => [competition.id, competition]));
    const groups = new Map();
    for (const match of candidates) {
      const season = seasonMap[match.season_id];
      if (!season) continue;
      const key = `${match.competition_id}:${season}`;
      const group = groups.get(key) || { competitionId: match.competition_id, competition: competitionMap[match.competition_id]?.name, season, matches: [] };
      group.matches.push(match.id);
      groups.set(key, group);
    }
    const plan = [...groups.values()].map((group) => ({ ...group, matchCap: group.matches.length, estimatedCalls: group.matches.length + 1 }));
    const estimatedCalls = plan.reduce((total, group) => total + group.estimatedCalls, 0);
    if (dryRun) return Response.json({ ok: true, dryRun: true, window: { from, to }, estimatedCalls, plan });

    const results = [];
    for (const group of plan) {
      try {
        const result = await runJob("football.live-sync", {
          db,
          competitionId: group.competitionId,
          season: group.season,
          matchCap: group.matchCap,
          requestLimit: group.estimatedCalls,
          apifootballKey: process.env.APIFOOTBALL_KEY,
          thesportsdbKey: process.env.THESPORTSDB_KEY,
        });
        results.push({ ...group, ok: true, result });
      } catch (error) {
        results.push({ ...group, ok: false, error: String(error?.message || error).slice(0, 500) });
      }
    }
    return Response.json({ ok: results.every((result) => result.ok), window: { from, to }, estimatedCalls, results }, { status: results.some((result) => result.ok) ? 200 : 500 });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 500) }, { status: 500 });
  }
}

export const POST = GET;
