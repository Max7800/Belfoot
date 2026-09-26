import { getAdmin } from "@/lib/supabaseAdmin";
import { preflightJobs } from "@/lib/jobPreflight";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const db = getAdmin();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return new Response("Unauthorized", { status: 401 });
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return new Response("Forbidden", { status: 403 });
  try {
    const input = await request.json().catch(() => ({}));
    return Response.json(await preflightJobs(db, input));
  } catch (preflightError) {
    return new Response(preflightError.message || String(preflightError), { status: 400 });
  }
}
