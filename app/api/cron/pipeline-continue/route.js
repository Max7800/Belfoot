import { getAdmin } from "@/lib/supabaseAdmin";
import { expireAbandonedRuns } from "@/lib/runLease";
import { updateSiteSettings } from "@/lib/siteSettings";
import { pickContinuableRun } from "@/lib/adminSync";
import { POST as runPipeline } from "@/app/api/admin/run-pipeline/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pipelines continués par le serveur (30/10/2026) : l'enchaînement des lots ne
// dépendait que de la page d'administration restée ouverte (« laisse l'onglet
// ouvert et l'ordinateur allumé »). Un lot par passage, seulement pour une pause
// marquée auto_continue (lot terminé dans le budget) : une erreur, un budget épuisé
// ou un retrait restent la décision de l'administrateur. La route des pipelines
// garde seule la main sur le bail, le budget et les écritures.
function secret(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || request.headers.get("x-jobs-secret") || "";
  const allowed = [process.env.JOBS_SECRET, process.env.CRON_SECRET].filter(Boolean);
  return allowed.includes(token) ? token : null;
}

export async function GET(request) {
  const token = secret(request);
  if (!token) return new Response("Unauthorized", { status: 401 });
  const db = getAdmin();
  try {
    await expireAbandonedRuns(db);
    const { data: runs, error } = await db.from("pipeline_runs").select("id,pipeline_key,status,heartbeat_at,params").eq("status", "paused").order("heartbeat_at", { ascending: true }).limit(50);
    if (error) throw error;
    const run = pickContinuableRun(runs || [], Date.now());
    if (!run) {
      await updateSiteSettings(db, { football_pipeline_continue_last: { at: new Date().toISOString(), idle: true } });
      return Response.json({ ok: true, idle: true });
    }
    const response = await runPipeline(new Request(new URL("/api/admin/run-pipeline", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pipelineRunId: run.id, continuation: true }),
    }));
    const text = await response.text();
    let result = null;
    try { result = JSON.parse(text); } catch { result = null; }
    const last = { at: new Date().toISOString(), pipeline: run.pipeline_key, status: result?.status || `HTTP ${response.status}`, detail: String(result?.detail || text || "").slice(0, 300) };
    await updateSiteSettings(db, { football_pipeline_continue_last: last });
    return Response.json({ ok: response.ok, ...last }, { status: response.ok || response.status === 409 ? 200 : 500 });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 300) }, { status: 500 });
  }
}

export const POST = GET;
