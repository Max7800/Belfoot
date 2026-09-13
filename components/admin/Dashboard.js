"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Dashboard() {
  const [c, setC] = useState({});
  const [jobs, setJobs] = useState([]);
  useEffect(() => { (async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const count = async (t, f) => { let b = supabase.from(t).select("*", { count: "exact", head: true }); if (f) b = f(b); const { count } = await b; return count ?? 0; };
    setC({
      tracked: await count("players", (b) => b.eq("tracked", true)),
      clubs: await count("clubs"),
      matches: await count("matches", (b) => b.gte("kickoff", today.toISOString())),
      pending: await count("contributions", (b) => b.eq("status", "pending")),
    });
    const { data } = await supabase.from("job_runs").select("*").order("started_at", { ascending: false }).limit(5);
    setJobs(data || []);
  })().catch(() => {}); }, []);
  const Stat = ({ n, l }) => <div className="rounded-xl border border-line/10 bg-surface p-4"><div className="text-2xl font-black">{n ?? "…"}</div><div className="text-xs text-muted">{l}</div></div>;
  return (
    <div>
      <h2 className="mb-4 text-lg font-bold">Tableau de bord</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={c.tracked} l="Belges suivis" />
        <Stat n={c.clubs} l="Clubs" />
        <Stat n={c.matches} l="Matchs à venir" />
        <Stat n={c.pending} l="Contributions en attente" />
      </div>
      <h3 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wider text-muted">Dernières synchros / jobs</h3>
      <div className="divide-y divide-line/10 rounded-xl border border-line/10">
        {jobs.map((j) => <div key={j.id} className="flex items-center justify-between p-3 text-sm"><span>{j.job_key}</span><span className={j.status === "error" ? "text-red-400" : j.status === "ok" ? "text-green-400" : "text-muted"}>{j.status}{j.detail ? ` · ${j.detail}` : ""}</span></div>)}
        {jobs.length === 0 && <div className="p-4 text-sm text-muted">Aucune exécution de job pour l'instant.</div>}
      </div>
    </div>
  );
}
