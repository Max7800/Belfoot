import { getAdmin } from "@/lib/supabaseAdmin";
import { JOB_PIPELINES } from "@/lib/jobCatalog";
import { preflightJobs } from "@/lib/jobPreflight";
import { runJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

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
  const input = await request.json().catch(() => ({}));
  try {
    const { db, user } = auth;
    const budget = Math.max(1, Math.min(Number(input.requestLimit) || 10, 100));
    let pipelineRun;
    let pipeline;
    if (input.pipelineRunId) {
      const { data, error } = await db.from("pipeline_runs").select("*").eq("id", input.pipelineRunId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Pipeline introuvable");
      if (data.status === "ok") return Response.json(data);
      if (data.status === "running" && Date.now() - new Date(data.heartbeat_at || data.started_at).getTime() < 20 * 60 * 1000) {
        throw new Error("Ce pipeline est encore actif. La reprise sera autorisée après 20 minutes sans battement.");
      }
      pipelineRun = data;
      pipeline = JOB_PIPELINES.find((item) => item.key === data.pipeline_key);
      if (!pipeline) throw new Error("Définition du pipeline introuvable");
      const { error: resumeError } = await db.from("pipeline_runs").update({ status: "running", detail: "Reprise demandée depuis l’administration.", heartbeat_at: new Date().toISOString(), finished_at: null }).eq("id", data.id);
      if (resumeError) throw resumeError;
    } else {
      pipeline = JOB_PIPELINES.find((item) => item.key === input.pipelineKey);
      if (!pipeline) throw new Error("Pipeline inconnu");
      const preflight = await preflightJobs(db, { ...input, pipelineKey: pipeline.key });
      if (!preflight.ok) throw new Error(preflight.blockers.join(" · "));
      const targetKey = input.competitionId ? String(input.competitionId) : input.teamExternalId ? `team:${input.teamExternalId}` : "all";
      const { data, error } = await db.from("pipeline_runs").insert({
        pipeline_key: pipeline.key,
        target_key: targetKey,
        params: { season: input.season || null, competitionId: input.competitionId || null, matchCap: input.matchCap || null, teamExternalId: input.teamExternalId || null, nationalCategory: input.nationalCategory || null },
        steps: pipeline.jobs,
        request_limit: budget,
        created_by: user.id,
      }).select().single();
      if (error?.code === "23505") throw new Error("Ce pipeline est déjà actif pour cette cible.");
      if (error || !data) throw error || new Error("Impossible de créer le pipeline");
      pipelineRun = data;
    }

    const params = pipelineRun.params || {};
    let used = Number(pipelineRun.request_count) || 0;
    let quotaRemaining = pipelineRun.quota_remaining ?? null;
    for (let index = Number(pipelineRun.next_step) || 0; index < pipeline.jobs.length; index++) {
      const remaining = Number(pipelineRun.request_limit) - used;
      if (remaining <= 0) throw new Error(`Budget global épuisé avant l’étape ${index + 1}.`);
      await db.from("pipeline_runs").update({ status: "running", next_step: index, detail: `Étape ${index + 1}/${pipeline.jobs.length} en cours : ${pipeline.jobs[index]}`, heartbeat_at: new Date().toISOString() }).eq("id", pipelineRun.id);
      try {
        const result = await runJob(pipeline.jobs[index], {
          db,
          ...params,
          requestLimit: remaining,
          pipelineRunId: pipelineRun.id,
          pipelineStep: index,
          thesportsdbKey: process.env.THESPORTSDB_KEY,
          apifootballKey: process.env.APIFOOTBALL_KEY,
        });
        used += result.requests || 0;
        quotaRemaining = result.quotaRemaining ?? quotaRemaining;
        await db.from("pipeline_runs").update({ next_step: index + 1, request_count: used, quota_remaining: quotaRemaining, detail: `Étape ${index + 1}/${pipeline.jobs.length} terminée.`, heartbeat_at: new Date().toISOString() }).eq("id", pipelineRun.id);
      } catch (stepError) {
        await db.from("pipeline_runs").update({ status: "error", next_step: index, request_count: used, quota_remaining: quotaRemaining, detail: stepError.message || String(stepError), heartbeat_at: new Date().toISOString(), finished_at: new Date().toISOString() }).eq("id", pipelineRun.id);
        throw stepError;
      }
    }
    const { data: finished, error: finishError } = await db.from("pipeline_runs").update({ status: "ok", next_step: pipeline.jobs.length, request_count: used, quota_remaining: quotaRemaining, detail: "Pipeline terminé.", heartbeat_at: new Date().toISOString(), finished_at: new Date().toISOString() }).eq("id", pipelineRun.id).select().single();
    if (finishError) throw finishError;
    return Response.json(finished);
  } catch (pipelineError) {
    return new Response(pipelineError.message || String(pipelineError), { status: 500 });
  }
}
