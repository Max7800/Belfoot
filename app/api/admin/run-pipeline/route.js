import { getAdmin } from "@/lib/supabaseAdmin";
import { JOB_PIPELINES } from "@/lib/jobCatalog";
import { preflightJobs } from "@/lib/jobPreflight";
import { runJob } from "@/lib/jobs";
import { LEASE_MS, LeaseLostError, expireAbandonedRuns, newLeaseToken, writeOwnedPipeline } from "@/lib/runLease";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

const conflict = (message) => new Response(message, { status: 409 });
const lostLease = (error) => error instanceof LeaseLostError || error?.code === "LEASE_LOST";

// Le jeton de prise de possession reste côté serveur.
function publicRun(row) {
  if (!row?.params?.lease_token) return row;
  const { lease_token: _token, ...params } = row.params;
  return { ...row, params };
}

// Une fonction interrompue ne revient jamais jusqu'au bloc qui reporte la
// consommation du job dans le pipeline : les tentatives rattachées font foi.
async function reconcileFromAttempts(db, run) {
  const { data: attempts, error } = await db.from("job_runs")
    .select("request_count,quota_remaining,started_at")
    .contains("params", { pipelineRunId: run.id });
  if (error) throw error;
  const reconciledCount = (attempts || []).reduce((sum, item) => sum + (Number(item.request_count) || 0), 0);
  const latestQuota = [...(attempts || [])]
    .filter((item) => item.quota_remaining != null)
    .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))[0]?.quota_remaining;
  return {
    request_count: Math.max(Number(run.request_count) || 0, reconciledCount),
    quota_remaining: latestQuota != null ? latestQuota : run.quota_remaining ?? null,
  };
}

export async function POST(request) {
  const auth = await adminContext(request);
  if (auth.response) return auth.response;
  const input = await request.json().catch(() => ({}));
  try {
    const { db, user } = auth;
    const budget = Math.max(1, Math.min(Number(input.requestLimit) || 10, 5000));
    // Exécutions abandonnées (bail dépassé) marquées avant toute décision :
    // une reprise ou une création ne voit jamais un « running » fantôme.
    await expireAbandonedRuns(db);
    // Jeton propre à CETTE invocation : toute écriture de l'exécution l'exige.
    const leaseToken = newLeaseToken();
    let pipelineRun;
    let pipeline;
    if (input.pipelineRunId) {
      const { data, error } = await db.from("pipeline_runs").select("*").eq("id", input.pipelineRunId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Pipeline introuvable");
      if (data.status === "ok") return Response.json(publicRun(data));
      pipeline = JOB_PIPELINES.find((item) => item.key === data.pipeline_key);
      if (!pipeline) throw new Error("Définition du pipeline introuvable");
      if (data.status === "running") {
        return conflict(`Ce pipeline est encore actif (battement de moins de ${LEASE_MS / 1000} s). La reprise sera possible s'il cesse de battre.`);
      }
      if (!["paused", "error"].includes(data.status)) return conflict(`Statut « ${data.status} » : reprise impossible.`);
      const counters = await reconcileFromAttempts(db, data);
      // À la reprise, le budget saisi représente l'enveloppe que l'admin
      // accepte encore de dépenser. On conserve le plafond existant s'il est
      // déjà plus généreux, sinon on l'étend sans effacer la consommation.
      const requestLimit = input.continuation
        ? Number(data.request_limit) || 0
        : Math.max(Number(data.request_limit) || 0, counters.request_count + budget);
      const resumeDetail = input.continuation
        ? "Lot suivant lancé automatiquement depuis l’administration."
        : `Reprise demandée depuis l’administration avec ${budget} appel(s) encore autorisé(s).`;
      // Prise de possession ATOMIQUE : une seule requête, conditionnée au statut
      // et au jeton lus. Deux reprises simultanées ne peuvent pas réussir toutes
      // les deux : la première change le jeton, la seconde ne trouve plus la ligne.
      let claim = db.from("pipeline_runs").update({
        status: "running",
        params: { ...(data.params || {}), lease_token: leaseToken },
        ...counters,
        request_limit: requestLimit,
        detail: resumeDetail,
        heartbeat_at: new Date().toISOString(),
        finished_at: null,
      }).eq("id", data.id).eq("status", data.status);
      claim = data.params?.lease_token ? claim.eq("params->>lease_token", data.params.lease_token) : claim.is("params->>lease_token", null);
      const { data: claimed, error: claimError } = await claim.select();
      if (claimError) throw claimError;
      if (!claimed?.length) return conflict("Ce pipeline vient d'être repris par une autre demande : rien n'a été relancé.");
      pipelineRun = claimed[0];
    } else {
      pipeline = JOB_PIPELINES.find((item) => item.key === input.pipelineKey);
      if (!pipeline) throw new Error("Pipeline inconnu");
      const preflight = await preflightJobs(db, { ...input, pipelineKey: pipeline.key });
      if (!preflight.ok) throw new Error(preflight.blockers.join(" · "));
      const targetKey = input.competitionId ? String(input.competitionId) : input.teamExternalId ? `team:${input.teamExternalId}` : "all";
      // Un pipeline en pause ou actif sur la même cible doit être repris, pas doublé.
      const { data: existing, error: existingError } = await db.from("pipeline_runs")
        .select("id,status,next_step,steps").eq("pipeline_key", pipeline.key).eq("target_key", targetKey).in("status", ["running", "paused"]);
      if (existingError) throw existingError;
      const paused = (existing || []).find((item) => item.status === "paused");
      if (paused) return conflict(`Un pipeline « ${pipeline.label} » est en pause pour cette cible (étape ${Math.min((Number(paused.next_step) || 0) + 1, (paused.steps || []).length || 1)}/${(paused.steps || []).length || pipeline.jobs.length}). Reprends-le depuis la liste des pipelines au lieu d'en créer un nouveau.`);
      if ((existing || []).some((item) => item.status === "running")) return conflict("Ce pipeline est déjà actif pour cette cible.");
      const { data, error } = await db.from("pipeline_runs").insert({
        pipeline_key: pipeline.key,
        target_key: targetKey,
        params: { season: input.season || null, competitionId: input.competitionId || null, matchCap: input.matchCap || null, batchSize: input.batchSize || null, teamExternalId: input.teamExternalId || null, nationalCategory: input.nationalCategory || null, lease_token: leaseToken },
        steps: pipeline.jobs,
        request_limit: budget,
        created_by: user.id,
      }).select().single();
      if (error?.code === "23505") return conflict("Ce pipeline est déjà actif pour cette cible.");
      if (error || !data) throw error || new Error("Impossible de créer le pipeline");
      pipelineRun = data;
    }

    // Toutes les écritures de l'exécution passent par le jeton : statut,
    // progression, battement, compteurs, points de reprise, erreurs.
    const own = (patch) => writeOwnedPipeline(db, pipelineRun.id, leaseToken, patch);
    let params = { ...(pipelineRun.params || {}), lease_token: leaseToken };
    let used = Number(pipelineRun.request_count) || 0;
    let quotaRemaining = pipelineRun.quota_remaining ?? null;
    for (let index = Number(pipelineRun.next_step) || 0; index < pipeline.jobs.length; index++) {
      const remaining = Number(pipelineRun.request_limit) - used;
      if (remaining <= 0 && pipeline.allowPartialBudget) {
        const paused = await own({
          status: "paused",
          next_step: index,
          request_count: used,
          quota_remaining: quotaRemaining,
          detail: `Budget global atteint avant l’étape ${index + 1}. Reprends avec une nouvelle enveloppe pour continuer sans doublon.`,
          finished_at: null,
        });
        return Response.json({ ...publicRun(paused), continuationRequired: false, budgetExhausted: true });
      }
      if (remaining <= 0) throw new Error(`Budget global épuisé avant l’étape ${index + 1}.`);
      await own({ next_step: index, detail: `Étape ${index + 1}/${pipeline.jobs.length} en cours : ${pipeline.jobs[index]}` });
      try {
        const jobKey = pipeline.jobs[index];
        const configuredCap = Number(pipeline.batchCaps?.[jobKey]) || Number(params.matchCap) || 3;
        let stepMatchCap = Math.max(1, Math.min(Number(params.matchCap) || configuredCap, configuredCap));
        if (pipeline.allowPartialBudget) {
          if (jobKey === "football.events") stepMatchCap = Math.min(stepMatchCap, remaining);
          if (jobKey === "football.lineups") stepMatchCap = Math.min(stepMatchCap, Math.floor(remaining / 3));
          if (stepMatchCap < 1) {
            const paused = await own({
              status: "paused",
              next_step: index,
              request_count: used,
              quota_remaining: quotaRemaining,
              detail: `Budget restant insuffisant pour le prochain lot de l’étape ${index + 1}. Reprends avec une nouvelle enveloppe.`,
              finished_at: null,
            });
            return Response.json({ ...publicRun(paused), continuationRequired: false, budgetExhausted: true });
          }
        }
        const { lease_token: _token, ...jobParams } = params;
        const result = await runJob(jobKey, {
          db,
          ...jobParams,
          globalScope: pipeline.globalScope || false,
          matchCap: stepMatchCap,
          drain: pipeline.drainJobs?.includes(jobKey) || false,
          requestLimit: remaining,
          pipelineRunId: pipelineRun.id,
          pipelineLeaseToken: leaseToken,
          pipelineStep: index,
          pipelineRequestBase: used,
          resumeState: params._resume?.[jobKey] || null,
          saveCheckpoint: async (state) => {
            params = { ...params, _resume: { ...(params._resume || {}), [jobKey]: state } };
            await own({ params });
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
          const paused = await own({
            status: "paused",
            next_step: index,
            request_count: used,
            quota_remaining: quotaRemaining,
            detail: `Lot terminé : ${progress}. La suite peut être lancée automatiquement.`,
            finished_at: null,
          });
          return Response.json({ ...publicRun(paused), continuationRequired: true, progress: result.progress || null });
        }
        if (params._resume?.[jobKey]) {
          const nextResume = { ...params._resume };
          delete nextResume[jobKey];
          params = { ...params, _resume: nextResume };
        }
        await own({ params, next_step: index + 1, request_count: used, quota_remaining: quotaRemaining, detail: `Étape ${index + 1}/${pipeline.jobs.length} terminée.` });
        if (pipeline.drainJobs?.length && index + 1 < pipeline.jobs.length) {
          const paused = await own({
            status: "paused",
            next_step: index + 1,
            request_count: used,
            quota_remaining: quotaRemaining,
            detail: `Étape ${index + 1}/${pipeline.jobs.length} terminée. L'étape suivante va démarrer dans un nouveau lot.`,
            finished_at: null,
          });
          return Response.json({ ...publicRun(paused), continuationRequired: true });
        }
      } catch (stepError) {
        // Instance dépossédée : elle n'a plus le droit d'écrire, y compris l'erreur.
        if (lostLease(stepError)) throw stepError;
        // Écriture conditionnée au jeton : une instance perdante ne peut jamais
        // faire passer en erreur le pipeline exécuté par l'instance gagnante.
        await own({ status: "error", next_step: index, request_count: used, quota_remaining: quotaRemaining, detail: stepError.message || String(stepError), finished_at: new Date().toISOString() });
        throw stepError;
      }
    }
    const finished = await own({ status: "ok", next_step: pipeline.jobs.length, request_count: used, quota_remaining: quotaRemaining, detail: "Pipeline terminé.", finished_at: new Date().toISOString() });
    return Response.json(publicRun(finished));
  } catch (pipelineError) {
    if (lostLease(pipelineError)) return conflict(pipelineError.message || "Pipeline repris par une autre exécution : cette instance s'arrête.");
    return new Response(pipelineError.message || String(pipelineError), { status: 500 });
  }
}
