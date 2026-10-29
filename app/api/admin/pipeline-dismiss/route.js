import { getAdmin } from "@/lib/supabaseAdmin";
import { expireAbandonedRuns } from "@/lib/runLease";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Retirer une exécution de pipeline restée « en erreur » ou « en pause » de la liste
// des reprises (30/10/2026 : trois blocs anciens restaient affichés sans rien à
// reprendre). La table n'accepte que running / paused / error / ok : le retrait est
// noté dans params.dismissed_at, sans migration ; l'avancement reste en base.
async function adminContext(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { response: new Response("Unauthorized", { status: 401 }) };
  const db = getAdmin();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { response: new Response("Unauthorized", { status: 401 }) };
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { response: new Response("Forbidden", { status: 403 }) };
  return { db, user };
}

export async function POST(request) {
  const auth = await adminContext(request);
  if (auth.response) return auth.response;
  const { db, user } = auth;
  const { pipelineRunId } = await request.json().catch(() => ({}));
  if (!pipelineRunId) return new Response("Exécution non précisée.", { status: 400 });
  try {
    // Une exécution abandonnée (bail dépassé) passe d'abord en erreur : jamais de retrait d'un « running » vivant.
    await expireAbandonedRuns(db);
    const { data: run, error } = await db.from("pipeline_runs").select("id,pipeline_key,status,params").eq("id", pipelineRunId).maybeSingle();
    if (error) throw error;
    if (!run) return new Response("Exécution introuvable.", { status: 404 });
    if (!["error", "paused"].includes(run.status)) return new Response(run.status === "running" ? "Exécution encore en cours : attends la fin du lot." : "Exécution terminée : rien à retirer.", { status: 409 });
    const dismissedAt = new Date().toISOString();
    const { error: updateError } = await db.from("pipeline_runs").update({ params: { ...(run.params || {}), dismissed_at: dismissedAt, dismissed_by: user.id } }).eq("id", run.id).in("status", ["error", "paused"]);
    if (updateError) throw updateError;
    await db.from("audit_log").insert({ actor: user.id, action: "pipeline.dismiss", target_table: "pipeline_runs", target_id: run.id, meta: { pipeline_key: run.pipeline_key, status: run.status } });
    return Response.json({ ok: true, id: run.id, dismissed_at: dismissedAt });
  } catch (error) {
    return new Response(error?.message || String(error), { status: 500 });
  }
}
