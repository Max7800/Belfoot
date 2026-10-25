// Contrat des background jobs. Exécutés CÔTÉ SERVEUR avec un client `db`
// service-role (fourni par la route /api/jobs). Trace dans job_runs.
import footballSync from "@/modules/football/jobs/sync";
import footballLiveSync from "@/modules/football/jobs/liveSync";
import footballDiscover from "@/modules/football/jobs/discoverBelgians";
import footballTrack from "@/modules/football/jobs/trackPlayers";
import footballSquads from "@/modules/football/jobs/squads";
import footballEvents from "@/modules/football/jobs/events";
import footballCoaches from "@/modules/football/jobs/coaches";
import footballLineups from "@/modules/football/jobs/lineups";
import footballTeamTest from "@/modules/football/jobs/teamTest";
import footballNationalTeam from "@/modules/football/jobs/nationalTeam";
import footballFindNationalTeams from "@/modules/football/jobs/findNationalTeams";
import footballLeagueCheck from "@/modules/football/jobs/leagueCheck";
import footballCampaignRollover from "@/modules/football/jobs/campaignRollover";
import footballClubSync from "@/modules/football/jobs/clubSync";
import footballResolveNationalClubs from "@/modules/football/jobs/resolveNationalPlayerClubs";
import footballPlayerCareers from "@/modules/football/jobs/playerCareers";
import footballTransfers from "@/modules/football/jobs/transfers";
import { jobKeys } from "@/lib/jobCatalog";
import { preflightJobs } from "@/lib/jobPreflight";
import { COMPETITION_COLLISION } from "@/modules/football/sync";
import { LeaseLostError, expireAbandonedRuns } from "@/lib/runLease";
import { resolveJobScope } from "@/lib/jobScope";

const JOBS = { "football.sync": footballSync, "football.live-sync": footballLiveSync, "football.discover-belgians": footballDiscover, "football.track-belgians": footballTrack, "football.player-careers": footballPlayerCareers, "football.transfers": footballTransfers, "football.squads": footballSquads, "football.events": footballEvents, "football.coaches": footballCoaches, "football.lineups": footballLineups, "football.team-test": footballTeamTest, "football.national-team": footballNationalTeam, "football.find-national-teams": footballFindNationalTeams, "football.league-check": footballLeagueCheck, "football.campaign-rollover": footballCampaignRollover, "football.club-sync": footballClubSync, "football.resolve-national-clubs": footballResolveNationalClubs };

export { jobKeys };

function cleanError(error) {
  const message = String(error?.message || error || "Erreur inconnue");
  return message
    .replace(/(x-apisports-key["']?\s*[:=]\s*)[^\s,"'}]+/gi, "$1[masqué]")
    .replace(/(service[_-]?role["']?\s*[:=]\s*)[^\s,"'}]+/gi, "$1[masqué]")
    .slice(0, 1800);
}

function requestBudget({ db, runId, limit, pipelineRunId = null, pipelineLeaseToken = null, pipelineRequestBase = 0 }) {
  let count = 0;
  let quotaRemaining = null;
  // Battement : chaque écriture est conditionnelle. Un job expiré (statut
  // timeout) ou un pipeline repris par une autre instance (jeton changé) ne
  // reçoit plus aucune écriture, et l'instance s'arrête AVANT l'appel API
  // suivant (beforeRequest est attendu avant chaque requête provider).
  const persist = async () => {
    const now = new Date().toISOString();
    const { data: job, error: jobError } = await db.from("job_runs").update({
      request_count: count,
      quota_remaining: quotaRemaining,
      heartbeat_at: now,
    }).eq("id", runId).eq("status", "running").select("id");
    if (jobError) throw jobError;
    if (!job?.length) throw new LeaseLostError("Job expiré (bail dépassé) : cette instance s'arrête sans rien écrire.");
    // Le pipeline doit survivre à une coupure brutale de la fonction. On
    // persiste donc sa consommation à chaque appel, pas seulement au retour
    // normal du job.
    if (pipelineRunId) {
      let query = db.from("pipeline_runs").update({
        request_count: pipelineRequestBase + count,
        quota_remaining: quotaRemaining,
        heartbeat_at: now,
      }).eq("id", pipelineRunId).eq("status", "running");
      if (pipelineLeaseToken) query = query.eq("params->>lease_token", pipelineLeaseToken);
      const { data: owned, error: pipelineError } = await query.select("id");
      if (pipelineError) throw pipelineError;
      if (!owned?.length) throw new LeaseLostError("Pipeline repris par une autre exécution ou expiré : cette instance s'arrête sans rien écrire.");
    }
  };
  return {
    get count() { return count; },
    get quotaRemaining() { return quotaRemaining; },
    async beforeRequest() {
      if (count >= limit) throw new Error(`Budget API atteint (${count}/${limit}). Relance avec un budget explicite si nécessaire.`);
      count++;
      await persist();
    },
    async afterResponse(headers) {
      const raw = headers?.get?.("x-ratelimit-requests-remaining") ?? headers?.get?.("x-ratelimit-remaining");
      const parsed = Number(raw);
      if (raw !== null && Number.isFinite(parsed)) quotaRemaining = parsed;
      await persist();
    },
  };
}

export async function runJob(key, ctx = {}) {
  const job = JOBS[key];
  if (!job || !jobKeys().includes(key)) throw new Error("Job inconnu: " + key);
  const db = ctx.db;
  if (!db) throw new Error("runJob nécessite un client db (service-role)");
  // Le préflight serveur bloque cible, migrations, quota connu et budget avant
  // tout appel provider ou création d'une exécution.
  // Périmètre explicite AVANT tout : un job ciblé sans identifiant est refusé
  // sans lecture, sans écriture et sans appel API (lib/jobScope.js).
  const scope = resolveJobScope(key, ctx);
  const preflight = await preflightJobs(db, { key, ...ctx }, { globalScope: scope === "global" });
  if (!preflight.ok) throw new Error(preflight.blockers.join(" · "));
  // L'enveloppe est choisie explicitement dans l'administration et validée
  // par le préflight. Un ancien plafond caché à 100 bloquait les compétitions
  // européennes (beaucoup plus de participants) même avec un quota Pro.
  const requestLimit = Math.max(1, Math.min(Number(ctx.requestLimit) || 10, 5000));
  // Clé de verrou alignée sur le périmètre retenu (une sélection reste « team:… »
  // même si une compétition est sélectionnée dans l'administration).
  const targetKey = scope === "national" ? `team:${ctx.teamExternalId}` : scope === "competition" ? String(ctx.competitionId) : scope;
  // Jobs et pipelines abandonnés (bail dépassé) : marqués, jamais supprimés.
  await expireAbandonedRuns(db);

  const { data: run, error: insertError } = await db.from("job_runs").insert({
    job_key: key,
    target_key: targetKey,
    request_limit: requestLimit,
    heartbeat_at: new Date().toISOString(),
    params: {
      season: ctx.season || null,
      competitionId: ctx.competitionId || null,
      playerId: ctx.playerId || null,
      clubId: ctx.clubId || null,
      includeCareerStats: ctx.includeCareerStats === true,
      matchCap: ctx.matchCap || null,
      teamExternalId: ctx.teamExternalId || null,
      nationalCategory: ctx.nationalCategory || null,
      nationalGender: ctx.nationalGender || null,
      pipelineRunId: ctx.pipelineRunId || null,
      pipelineStep: ctx.pipelineStep ?? null,
      batchSize: ctx.batchSize || null,
    },
  }).select().single();
  if (insertError?.code === "23505") throw new Error("Ce job est déjà en cours pour cette sélection.");
  if (insertError || !run) throw new Error(`Impossible de tracer le job : ${cleanError(insertError)}`);

  const tracker = requestBudget({
    db,
    runId: run.id,
    limit: requestLimit,
    pipelineRunId: ctx.pipelineRunId || null,
    pipelineLeaseToken: ctx.pipelineLeaseToken || null,
    pipelineRequestBase: Number(ctx.pipelineRequestBase) || 0,
  });
  try {
    const outcome = await job.run({ ...ctx, requestTracker: tracker });
    const detail = typeof outcome === "string" ? outcome : outcome?.detail;
    const complete = typeof outcome !== "object" || outcome?.complete !== false;
    const usage = `${tracker.count}/${requestLimit} appels API${tracker.quotaRemaining === null ? "" : ` · quota restant ${tracker.quotaRemaining}`}`;
    const finalDetail = [detail, usage].filter(Boolean).join(" · ");
    // Conditionnelle : un job expiré entre-temps garde son statut timeout.
    const { data: finished, error: finishError } = await db.from("job_runs").update({ status: complete ? "ok" : "paused", detail: finalDetail, finished_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() }).eq("id", run.id).eq("status", "running").select("id");
    if (finishError) throw finishError;
    if (!finished?.length) throw new LeaseLostError("Job expiré avant sa fin (bail dépassé) : son résultat n'est pas enregistré.");
    return { ok: true, complete, progress: outcome?.progress || null, detail: finalDetail, requests: tracker.count, requestLimit, quotaRemaining: tracker.quotaRemaining };
  } catch (e) {
    const message = cleanError(e);
    // Une collision de compétitions se reproduira à l'identique tant qu'un humain
    // n'aura pas tranché : son code reste lisible dans params pour les crons.
    const errorCode = e?.code === COMPETITION_COLLISION ? { params: { ...(run.params || {}), error_code: COMPETITION_COLLISION } } : {};
    // Conditionnelle aussi : n'écrase jamais un statut timeout posé par l'expiration.
    await db.from("job_runs").update({ status: "error", detail: message, finished_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), ...errorCode }).eq("id", run.id).eq("status", "running");
    const failure = new Error(message);
    // L'appelant (pipeline) doit savoir que l'instance a perdu la main.
    if (e instanceof LeaseLostError) failure.code = e.code;
    throw failure;
  }
}
