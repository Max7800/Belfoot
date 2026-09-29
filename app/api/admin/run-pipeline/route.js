import { getAdmin } from "@/lib/supabaseAdmin";
import { JOB_PIPELINES } from "@/lib/jobCatalog";
import { preflightJobs } from "@/lib/jobPreflight";
import { runJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_PIPELINE_MS = 2 * 60 * 1000;

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
    const budget = Math.max(1, Math.min(Number(input.requestLimit) || 10, 500));
    let pipelineRun;
    let pipeline;
    if (input.pipelineRunId) {
      const { data, error } = await db.from("pipeline_runs").select("*").eq("id", input.pipelineRunId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Pipeline introuvable");
      if (data.status === "ok") return Response.json(data);
      if (data.status === "running" && Date.now() - new Date(data.heartbeat_at || data.started_at).getTime() < STALE_PIPELINE_MS) {
        throw new Error("Ce pipeline est encore actif. La reprise sera autorisée après deux minutes sans battement.");
      }
      // Une fonction interrompue ne revient jamais jusqu'au bloc qui reporte
      // la consommation du job dans le pipeline. Les compteurs des tentatives
      // rattachées constituent alors la source de vérité.
      const { data: attempts, error: attemptsError } = await db.from("job_runs")
        .select("request_count,quota_remaining,started_at")
        .contains("params", { pipelineRunId: data.id });
      if (attemptsError) throw attemptsError;
      const reconciledCount = (attempts || []).reduce((sum, item) => sum + (Number(item.request_count) || 0), 0);
      const latestQuota = [...(attempts || [])]
        .filter((item) => item.quota_remaining != null)
        .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))[0]?.quota_remaining;
      data.request_count = Math.max(Number(data.request_count) || 0, reconciledCount);
      if (latestQuota != null) data.quota_remaining = latestQuota;
      // À la reprise, le budget saisi représente l'enveloppe que l'admin
      // accepte encore de dépenser. On conserve le plafond existant s'il est
      // déjà plus généreux, sinon on l'étend sans effacer la consommation.
      if (!input.continuation) {
        data.request_limit = Math.max(
          Number(data.request_limit) || 0,
          data.request_count + budget,
        );
      }
      pipelineRun = data;
      pipeline = JOB_PIPELINES.find((item) => item.key === data.pipeline_key);
      if (!pipeline) throw new Error("Définition du pipeline introuvable");
      const resumeDetail = input.continuation
        ? "Lot suivant lancé automatiquement depuis l’administration."
        : `Reprise demandée depuis l’administration avec ${budget} appel(s) encore autorisé(s).`;
      const { error: resumeError } = await db.from("pipeline_runs").update({ status: "running", request_count: data.request_count, request_limit: data.request_limit, quota_remaining: data.quota_remaining, detail: resumeDetail, heartbeat_at: new Date().toISOString(), finished_at: null }).eq("id", data.id);
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
        params: { season: input.season || null, competitionId: input.competitionId || null, matchCap: input.matchCap || null, batchSize: input.batchSize || null, teamExternalId: input.teamExternalId || null, nationalCategory: input.nationalCategory || null },
        steps: pipeline.jobs,
        request_limit: budget,
        created_by: user.id,
      }).select().single();
      if (error?.code === "23505") throw new Error("Ce pipeline est déjà actif pour cette cible.");
      if (error || !data) throw error || new Error("Impossible de créer le pipeline");
      pipelineRun = data;
    }

    let params = pipelineRun.params || {};
    let used = Number(pipelineRun.request_count) || 0;
    let quotaRemaining = pipelineRun.quota_remaining ?? null;
    for (let index = Number(pipelineRun.next_step) || 0; index < pipeline.jobs.length; index++) {
      const remaining = Number(pipelineRun.request_limit) - used;
      if (remaining <= 0 && pipeline.allowPartialBudget) {
        const { data: paused, error: pauseError } = await db.from("pipeline_runs").update({
          status: "paused",
          next_step: index,
          request_count: used,
          quota_remaining: quotaRemaining,
          detail: `Budget global atteint avant l’étape ${index + 1}. Reprends avec une nouvelle enveloppe pour continuer sans doublon.`,
          heartbeat_at: new Date().toISOString(),
          finished_at: null,
        }).eq("id", pipelineRun.id).select().single();
        if (pauseError) throw pauseError;
        return Response.json({ ...paused, continuationRequired: false, budgetExhausted: true });
      }
      if (remaining <= 0) throw new Error(`Budget global épuisé avant l’étape ${index + 1}.`);
      await db.from("pipeline_runs").update({ status: "running", next_step: index, detail: `Étape ${index + 1}/${pipeline.jobs.length} en cours : ${pipeline.jobs[index]}`, heartbeat_at: new Date().toISOString() }).eq("id", pipelineRun.id);
      try {
        const jobKey = pipeline.jobs[index];
        const configuredCap = Number(pipeline.batchCaps?.[jobKey]) || Number(params.matchCap) || 3;
        let stepMatchCap = Math.max(1, Math.min(Number(params.matchCap) || configuredCap, configuredCap));
        if (pipeline.allowPartialBudget) {
          if (jobKey === "football.events") stepMatchCap = Math.min(stepMatchCap, remaining);
          if (jobKey === "football.lineups") stepMatchCap = Math.min(stepMatchCap, Math.floor(remaining / 3));
          if (stepMatchCap < 1) {
            const { data: paused, error: pauseError } = await db.from("pipeline_runs").update({
              status: "paused",
              next_step: index,
              request_count: used,
              quota_remaining: quotaRemaining,
              detail: `Budget restant insuffisant pour le prochain lot de l’étape ${index + 1}. Reprends avec une nouvelle enveloppe.`,
              heartbeat_at: new Date().toISOString(),
              finished_at: null,
            }).eq("id", pipelineRun.id).select().single();
            if (pauseError) throw pauseError;
            return Response.json({ ...paused, continuationRequired: false, budgetExhausted: true });
          }
        }
        const result = await runJob(jobKey, {
          db,
          ...params,
          matchCap: stepMatchCap,
          drain: pipeline.drainJobs?.includes(jobKey) || false,
          requestLimit: remaining,
          pipelineRunId: pipelineRun.id,
          pipelineStep: index,
          pipelineRequestBase: used,
          resumeState: params._resume?.[jobKey] || null,
          saveCheckpoint: async (state) => {
            params = { ...params, _resume: { ...(params._resume || {}), [jobKey]: state } };
            const { error } = await db.from("pipeline_runs").update({ params, heartbeat_at: new Date().toISOString() }).eq("id", pipelineRun.id);
            if (error) throw error;
          },
          thesportsdbKey: process.env.THESPORTSDB_KEY,
          apifootballKey: process.env.APIFOOTBALL_KEY,
        });
        used += result.requests || 0;
        quotaRemaining = result.quotaRemaining ?? quotaRemaining;
        if (!result.complete) {
          const progress = result.progress?.total
            ? `${result.progress.current}/${result.progress.total} ${result.progress.unit || "éléments"}`
            : "checkpoint enregistré";
          const { data: paused, error: pauseError } = await db.from("pipeline_runs").update({
            status: "paused",
            next_step: index,
            request_count: used,
            quota_remaining: quotaRemaining,
            detail: `Lot terminé : ${progress}. La suite peut être lancée automatiquement.`,
            heartbeat_at: new Date().toISOString(),
            finished_at: null,
          }).eq("id", pipelineRun.id).select().single();
          if (pauseError) throw pauseError;
          return Response.json({ ...paused, continuationRequired: true, progress: result.progress || null });
        }
        if (params._resume?.[jobKey]) {
          const nextResume = { ...params._resume };
          delete nextResume[jobKey];
          params = { ...params, _resume: nextResume };
        }
        await db.from("pipeline_runs").update({ params, next_step: index + 1, request_count: used, quota_remaining: quotaRemaining, detail: `Étape ${index + 1}/${pipeline.jobs.length} terminée.`, heartbeat_at: new Date().toISOString() }).eq("id", pipelineRun.id);
        if (pipeline.drainJobs?.length && index + 1 < pipeline.jobs.length) {
          const { data: paused, error: pauseError } = await db.from("pipeline_runs").update({
            status: "paused",
            next_step: index + 1,
            request_count: used,
            quota_remaining: quotaRemaining,
            detail: `Étape ${index + 1}/${pipeline.jobs.length} terminée. L'étape suivante va démarrer dans un nouveau lot.`,
            heartbeat_at: new Date().toISOString(),
            finished_at: null,
          }).eq("id", pipelineRun.id).select().single();
          if (pauseError) throw pauseError;
          return Response.json({ ...paused, continuationRequired: true });
        }
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
