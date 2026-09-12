// Contrat des background jobs : { key, run() }. Exécutés CÔTÉ SERVEUR (jamais par
// le visiteur). Trace dans job_runs. Ex. cible : ingestion live foot.
import { supabase } from "./supabaseClient";
import footballLiveSync from "@/modules/football/jobs/liveSync";

const JOBS = { "football.live-sync": footballLiveSync };

export function jobKeys() { return Object.keys(JOBS); }

export async function runJob(key, ctx = {}) {
  const job = JOBS[key];
  if (!job) throw new Error("Job inconnu: " + key);
  const { data: run } = await supabase.from("job_runs").insert({ job_key: key }).select().single();
  try {
    const detail = await job.run(ctx);
    await supabase.from("job_runs").update({ status: "ok", detail: detail || null, finished_at: new Date().toISOString() }).eq("id", run?.id);
    return { ok: true, detail };
  } catch (e) {
    await supabase.from("job_runs").update({ status: "error", detail: String(e.message), finished_at: new Date().toISOString() }).eq("id", run?.id);
    throw e;
  }
}
