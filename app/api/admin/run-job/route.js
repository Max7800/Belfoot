import { runJob } from "@/lib/jobs";
import { getAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";

// Déclenche un job depuis l'admin. Sécurité : on valide le JETON de session de
// l'utilisateur et on exige role='admin'. Aucun secret ne transite par le client
// (le service-role et le JOBS_SECRET restent côté serveur).
export async function POST(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const admin = getAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return new Response("Unauthorized", { status: 401 });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return new Response("Forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body.key) return new Response("Missing job key", { status: 400 });
  try {
    return Response.json(await runJob(body.key, { db: admin, season: body.season, competitionId: body.competitionId || null, matchCap: body.matchCap, batchSize: body.batchSize, requestLimit: body.requestLimit, teamExternalId: body.teamExternalId || null, nationalCategory: body.nationalCategory || null, thesportsdbKey: process.env.THESPORTSDB_KEY, apifootballKey: process.env.APIFOOTBALL_KEY }));
  } catch (e) { return new Response(String(e.message), { status: 500 }); }
}
