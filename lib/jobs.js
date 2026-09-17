// Contrat des background jobs. Exécutés CÔTÉ SERVEUR avec un client `db`
// service-role (fourni par la route /api/jobs). Trace dans job_runs.
import footballSync from "@/modules/football/jobs/sync";
import footballLiveSync from "@/modules/football/jobs/liveSync";
import footballDiscover from "@/modules/football/jobs/discoverBelgians";
import footballTrack from "@/modules/football/jobs/trackPlayers";
import footballSquads from "@/modules/football/jobs/squads";
import footballEvents from "@/modules/football/jobs/events";
import footballCoaches from "@/modules/football/jobs/coaches";

const JOBS = { "football.sync": footballSync, "football.live-sync": footballLiveSync, "football.discover-belgians": footballDiscover, "football.track-belgians": footballTrack, "football.squads": footballSquads, "football.events": footballEvents, "football.coaches": footballCoaches };

export function jobKeys() { return Object.keys(JOBS); }

export async function runJob(key, ctx = {}) {
  const job = JOBS[key];
  if (!job) throw new Error("Job inconnu: " + key);
  const db = ctx.db;
  if (!db) throw new Error("runJob nécessite un client db (service-role)");
  const { data: run } = await db.from("job_runs").insert({ job_key: key }).select().single();
  try {
    const detail = await job.run(ctx);
    await db.from("job_runs").update({ status: "ok", detail: detail || null, finished_at: new Date().toISOString() }).eq("id", run?.id);
    return { ok: true, detail };
  } catch (e) {
    await db.from("job_runs").update({ status: "error", detail: String(e.message), finished_at: new Date().toISOString() }).eq("id", run?.id);
    throw e;
  }
}
