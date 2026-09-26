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
import footballResolveNationalClubs from "@/modules/football/jobs/resolveNationalPlayerClubs";
import { jobKeys, JOB_CATALOG } from "@/lib/jobCatalog";
import { assertImportTargetAllowed } from "@/lib/importPlan";
import { seasonYear } from "@/modules/football/season";

const JOBS = { "football.sync": footballSync, "football.live-sync": footballLiveSync, "football.discover-belgians": footballDiscover, "football.track-belgians": footballTrack, "football.squads": footballSquads, "football.events": footballEvents, "football.coaches": footballCoaches, "football.lineups": footballLineups, "football.team-test": footballTeamTest, "football.national-team": footballNationalTeam, "football.find-national-teams": footballFindNationalTeams, "football.resolve-national-clubs": footballResolveNationalClubs };

export { jobKeys };

const STALE_AFTER_MS = 20 * 60 * 1000;

function cleanError(error) {
  const message = String(error?.message || error || "Erreur inconnue");
  return message
    .replace(/(x-apisports-key["']?\s*[:=]\s*)[^\s,"'}]+/gi, "$1[masqué]")
    .replace(/(service[_-]?role["']?\s*[:=]\s*)[^\s,"'}]+/gi, "$1[masqué]")
    .slice(0, 1800);
}

function requestBudget({ db, runId, limit }) {
  let count = 0;
  let quotaRemaining = null;
  const persist = async () => {
    await db.from("job_runs").update({
      request_count: count,
      quota_remaining: quotaRemaining,
      heartbeat_at: new Date().toISOString(),
    }).eq("id", runId);
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
  // Aucun job provider ne part avant validation de sa cible et de ses migrations.
  const catalogEntry = JOB_CATALOG[key] || {};
  await assertImportTargetAllowed(db, key, ctx, catalogEntry);
  const requiredMigrations = [
    { module: "core", version: "0004_job_execution_guardrails" },
    ...(catalogEntry.requiresMigrations || []),
    ...(seasonYear(ctx.season) >= 2026 ? [{ module: "football", version: "0032_season_rollout" }] : []),
  ];
  for (const required of requiredMigrations) {
    const { data: mig, error: migrationError } = await db.from("schema_migrations").select("module,version").eq("module", required.module).eq("version", required.version).maybeSingle();
    if (migrationError) throw new Error(`Impossible de vérifier les migrations : ${cleanError(migrationError)}`);
    if (!mig) throw new Error(`Migration requise non appliquée : « ${required.module}/${required.version} ». Applique-la dans Supabase avant de lancer ce job.`);
  }
  const requestLimit = Math.max(1, Math.min(Number(ctx.requestLimit) || 10, 100));
  const targetKey = ctx.competitionId ? String(ctx.competitionId) : ctx.teamExternalId ? `team:${ctx.teamExternalId}` : "all";
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { error: staleError } = await db.from("job_runs").update({
    status: "timeout",
    detail: "Exécution interrompue ou expirée après 20 minutes.",
    finished_at: new Date().toISOString(),
  }).eq("status", "running").lt("heartbeat_at", staleBefore);
  if (staleError) throw new Error(`Impossible de vérifier les jobs actifs : ${cleanError(staleError)}`);

  const { data: run, error: insertError } = await db.from("job_runs").insert({
    job_key: key,
    target_key: targetKey,
    request_limit: requestLimit,
    heartbeat_at: new Date().toISOString(),
    params: {
      season: ctx.season || null,
      competitionId: ctx.competitionId || null,
      matchCap: ctx.matchCap || null,
      teamExternalId: ctx.teamExternalId || null,
      nationalCategory: ctx.nationalCategory || null,
    },
  }).select().single();
  if (insertError?.code === "23505") throw new Error("Ce job est déjà en cours pour cette sélection.");
  if (insertError || !run) throw new Error(`Impossible de tracer le job : ${cleanError(insertError)}`);

  const tracker = requestBudget({ db, runId: run.id, limit: requestLimit });
  try {
    const detail = await job.run({ ...ctx, requestTracker: tracker });
    const usage = `${tracker.count}/${requestLimit} appels API${tracker.quotaRemaining === null ? "" : ` · quota restant ${tracker.quotaRemaining}`}`;
    const finalDetail = [detail, usage].filter(Boolean).join(" · ");
    const { error: finishError } = await db.from("job_runs").update({ status: "ok", detail: finalDetail, finished_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() }).eq("id", run.id);
    if (finishError) throw finishError;
    return { ok: true, detail: finalDetail, requests: tracker.count, requestLimit, quotaRemaining: tracker.quotaRemaining };
  } catch (e) {
    const message = cleanError(e);
    await db.from("job_runs").update({ status: "error", detail: message, finished_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() }).eq("id", run.id);
    throw new Error(message);
  }
}
