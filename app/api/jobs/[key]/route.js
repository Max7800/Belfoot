import { runJob } from "@/lib/jobs";
import { getAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  const secret = req.headers.get("x-jobs-secret");
  if (!process.env.JOBS_SECRET || secret !== process.env.JOBS_SECRET) return new Response("Unauthorized", { status: 401 });
  try {
    const season = new URL(req.url).searchParams.get("season") || undefined;
    return Response.json(await runJob(params.key, { db: getAdmin(), season, thesportsdbKey: process.env.THESPORTSDB_KEY, apifootballKey: process.env.APIFOOTBALL_KEY }));
  } catch (e) { return new Response(String(e.message), { status: 500 }); }
}
