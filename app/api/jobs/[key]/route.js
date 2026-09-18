import { runJob } from "@/lib/jobs";
import { getAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function authorized(request) {
  const direct = request.headers.get("x-jobs-secret");
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const allowed = [process.env.JOBS_SECRET, process.env.CRON_SECRET].filter(Boolean);
  return allowed.length > 0 && (allowed.includes(direct) || allowed.includes(bearer));
}

async function handle(request, { params }) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    const { key } = await params;
    const url = new URL(request.url);
    const season = url.searchParams.get("season") || undefined;
    const competitionId = url.searchParams.get("competitionId") || null;
    const matchCap = url.searchParams.get("matchCap") || undefined;
    const requestLimit = url.searchParams.get("requestLimit") || undefined;
    const teamExternalId = url.searchParams.get("teamExternalId") || null;
    return Response.json(await runJob(key, {
      db: getAdmin(), season, competitionId, matchCap, requestLimit, teamExternalId,
      thesportsdbKey: process.env.THESPORTSDB_KEY,
      apifootballKey: process.env.APIFOOTBALL_KEY,
    }));
  } catch (error) {
    return new Response(String(error.message), { status: 500 });
  }
}

// POST reste disponible pour les intégrations existantes. GET est requis par
// les cron Vercel, qui transmettent CRON_SECRET via Authorization: Bearer.
export const GET = handle;
export const POST = handle;
