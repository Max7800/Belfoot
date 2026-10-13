// Bail des exécutions (jobs et pipelines) et jeton de prise de possession.
//
// Toutes les routes qui exécutent des jobs ou des pipelines déclarent
// `maxDuration = MAX_FUNCTION_SECONDS` : Vercel arrête la fonction au-delà.
// Une exécution `running` sans battement depuis plus que le bail est donc
// MORTE (fonction coupée), jamais seulement lente. La marge couvre l'écart
// d'horloge et le temps entre le dernier battement et l'arrêt effectif.
// Un test vérifie que chaque route reste dans cette durée.
export const MAX_FUNCTION_SECONDS = 60;
export const LEASE_MARGIN_SECONDS = 60;
export const LEASE_MS = (MAX_FUNCTION_SECONDS + LEASE_MARGIN_SECONDS) * 1000;

// Une instance qui a perdu la main (pipeline expiré ou repris par une autre
// instance, job expiré) ne doit plus rien écrire : elle lève cette erreur.
export class LeaseLostError extends Error {
  constructor(message) {
    super(message);
    this.name = "LeaseLostError";
    this.code = "LEASE_LOST";
  }
}

// Colonnes de pipeline_runs lisibles par le navigateur (panneau Jobs). `params`
// en est exclu : il contient le jeton de prise de possession (lease_token), qui
// ne doit jamais quitter le serveur. Toute lecture côté client passe par cette liste.
export const PIPELINE_RUN_PUBLIC_COLUMNS = "id,pipeline_key,target_key,status,next_step,steps,request_count,request_limit,quota_remaining,detail,started_at,heartbeat_at,finished_at";

// Perte de bail : à RELANCER immédiatement, jamais à transformer en simple
// avertissement ni à traiter comme l'erreur d'un élément du lot. Sinon le job
// poursuivrait ses écritures métier après avoir perdu la main.
export function isLeaseLost(error) {
  return error instanceof LeaseLostError || error?.code === "LEASE_LOST";
}

const lastBeat = (row) => Date.parse(row?.heartbeat_at || row?.started_at || 0) || 0;

// Règle unique, partagée par le serveur et l'affichage de l'administration.
export function isLeaseExpired(row, now = Date.now()) {
  return row?.status === "running" && Number(now) - lastBeat(row) > LEASE_MS;
}

// État lisible d'une exécution : active (bail valide), abandoned (bail
// dépassé, pas encore marquée), paused, error, ok…
export function runState(row, now = Date.now()) {
  if (row?.status === "running") return isLeaseExpired(row, now) ? "abandoned" : "active";
  return row?.status || "unknown";
}

export function newLeaseToken() {
  return globalThis.crypto.randomUUID();
}

const secondsSince = (row, now) => Math.round((Number(now) - lastBeat(row)) / 1000);

// Expire les jobs et pipelines `running` dont le bail est dépassé. Chaque mise
// à jour est conditionnelle (toujours `running` ET toujours sans battement
// récent) : une exécution qui bat entre la lecture et l'écriture n'est jamais
// touchée. Rien n'est supprimé ; l'historique et la progression sont conservés.
export async function expireAbandonedRuns(db, now = new Date()) {
  const nowIso = new Date(now).toISOString();
  const staleBefore = new Date(Number(new Date(now)) - LEASE_MS).toISOString();
  const expired = { jobs: 0, pipelines: 0 };

  const { data: jobs, error: jobsError } = await db.from("job_runs").update({
    status: "timeout",
    detail: `Exécution interrompue : aucun battement depuis plus de ${LEASE_MS / 1000} s (bail expiré).`,
    finished_at: nowIso,
  }).eq("status", "running").lt("heartbeat_at", staleBefore).select("id");
  if (jobsError) throw new Error(`Impossible de vérifier les jobs actifs : ${jobsError.message}`);
  expired.jobs = (jobs || []).length;

  const { data: stale, error: staleError } = await db.from("pipeline_runs")
    .select("id,heartbeat_at,started_at,request_count,next_step,steps")
    .eq("status", "running").lt("heartbeat_at", staleBefore);
  if (staleError) throw new Error(`Impossible de vérifier les pipelines actifs : ${staleError.message}`);
  for (const run of stale || []) {
    // Une fonction coupée n'a pas reporté sa consommation : les tentatives
    // rattachées (job_runs) sont la source de vérité du compteur.
    const { data: attempts, error: attemptsError } = await db.from("job_runs")
      .select("request_count").contains("params", { pipelineRunId: run.id });
    if (attemptsError) throw new Error(`Impossible de réconcilier le pipeline ${run.id} : ${attemptsError.message}`);
    const reconciled = (attempts || []).reduce((sum, item) => sum + (Number(item.request_count) || 0), 0);
    const step = Math.min((Number(run.next_step) || 0) + 1, (run.steps || []).length || 1);
    const { data: updated, error: updateError } = await db.from("pipeline_runs").update({
      status: "error",
      request_count: Math.max(Number(run.request_count) || 0, reconciled),
      detail: `Pipeline abandonné : aucun battement depuis ${secondsSince(run, now)} s (bail de ${LEASE_MS / 1000} s dépassé) pendant l'étape ${step}. Progression conservée, reprise possible.`,
      finished_at: nowIso,
    }).eq("id", run.id).eq("status", "running").lt("heartbeat_at", staleBefore).select("id");
    if (updateError) throw new Error(`Impossible d'expirer le pipeline ${run.id} : ${updateError.message}`);
    expired.pipelines += (updated || []).length;
  }
  return expired;
}

// Écriture d'une exécution de pipeline par l'instance qui en détient le jeton.
// Une seule requête UPDATE … WHERE id AND status = 'running' AND jeton : en
// Postgres, la condition est réévaluée sur la ligne verrouillée, donc une
// instance dépossédée (jeton changé, ou pipeline expiré) n'écrit jamais.
export async function writeOwnedPipeline(db, runId, leaseToken, patch) {
  const { data, error } = await db.from("pipeline_runs")
    .update({ heartbeat_at: new Date().toISOString(), ...patch })
    .eq("id", runId).eq("status", "running").eq("params->>lease_token", leaseToken)
    .select();
  if (error) throw error;
  if (!data?.length) throw new LeaseLostError("Pipeline repris par une autre exécution ou expiré : cette instance s'arrête sans rien écrire.");
  return data[0];
}
