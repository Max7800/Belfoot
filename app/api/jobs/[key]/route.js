import { runJob } from "@/lib/jobs";
export const dynamic = "force-dynamic";
export async function POST(req, { params }) {
  const secret = req.headers.get("x-jobs-secret");
  if (!process.env.JOBS_SECRET || secret !== process.env.JOBS_SECRET) return new Response("Unauthorized", { status: 401 });
  try { return Response.json(await runJob(params.key)); }
  catch (e) { return new Response(String(e.message), { status: 500 }); }
}
