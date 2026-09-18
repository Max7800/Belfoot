"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, FileText, RefreshCw, Shield, Trophy, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const shortcuts = [
  { href: "/admin/news", label: "Nouvelle actualité", detail: "Écrire et publier", icon: FileText },
  { href: "/admin/players", label: "Gérer les joueurs", detail: "Effectifs et suivi", icon: Users },
  { href: "/admin/competitions", label: "Compétitions", detail: "Bandeaux et réglages", icon: Trophy },
  { href: "/admin/jobs", label: "Synchronisations", detail: "Préparer ou contrôler", icon: RefreshCw },
];

export default function Dashboard() {
  const [counts, setCounts] = useState({});
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    (async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const count = async (table, configure) => {
        let query = supabase.from(table).select("*", { count: "exact", head: true });
        if (configure) query = configure(query);
        const result = await query;
        return result.count ?? 0;
      };
      const [tracked, clubs, matches, pending, jobsResult] = await Promise.all([
        count("players", (query) => query.eq("tracked", true)),
        count("clubs"),
        count("matches", (query) => query.gte("kickoff", today.toISOString())),
        count("contributions", (query) => query.eq("status", "pending")),
        supabase.from("job_runs").select("*").order("started_at", { ascending: false }).limit(6),
      ]);
      setCounts({ tracked, clubs, matches, pending });
      setJobs(jobsResult.data || []);
    })().catch(() => {});
  }, []);

  const errors = jobs.filter((job) => job.status === "error");
  const Stat = ({ number, label }) => <div className="rounded-xl border border-line/10 bg-surface p-4"><div className="text-2xl font-black">{number ?? "…"}</div><div className="text-xs text-muted">{label}</div></div>;

  return (
    <div>
      <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Centre de contrôle</p><h1 className="mt-1 text-2xl font-black">Vue d&apos;ensemble</h1><p className="mt-1 text-sm text-muted">Les accès utiles au quotidien et l&apos;état des données Belfoot.</p></div>

      {errors.length > 0 && <Link href="/admin/jobs" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm"><AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={18} /><span className="flex-1"><b className="block text-content">{errors.length} synchronisation{errors.length > 1 ? "s" : ""} à vérifier</b><span className="text-muted">Le dernier incident concerne {errors[0].job_key}.</span></span><ArrowRight size={16} className="mt-1" /></Link>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat number={counts.tracked} label="Belges suivis" />
        <Stat number={counts.clubs} label="Clubs" />
        <Stat number={counts.matches} label="Matchs à venir" />
        <Stat number={counts.pending} label="Contributions en attente" />
      </div>

      <h2 className="mb-2 mt-7 text-sm font-bold uppercase tracking-wider text-muted">Accès rapides</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map(({ href, label, detail, icon: Icon }) => <Link key={href} href={href} className="group flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent/30"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><Icon size={18} /></span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{label}</b><span className="text-xs text-muted">{detail}</span></span><ArrowRight size={15} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-content" /></Link>)}
      </div>

      <div className="mt-7 flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-wider text-muted">Dernières synchronisations</h2><Link href="/admin/jobs" className="text-xs text-accent hover:underline">Tout afficher</Link></div>
      <div className="mt-2 divide-y divide-line/10 overflow-hidden rounded-xl border border-line/10 bg-surface">
        {jobs.map((job) => <div key={job.id} className="flex items-start gap-3 p-3 text-sm"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${job.status === "error" ? "bg-red-400" : job.status === "ok" ? "bg-green-400" : "bg-muted"}`} /><span className="min-w-0 flex-1"><b className="block truncate font-semibold">{job.job_key}</b><span className="block truncate text-xs text-muted">{job.detail || new Date(job.started_at).toLocaleString("fr-BE")}</span></span><span className={`text-xs ${job.status === "error" ? "text-red-400" : job.status === "ok" ? "text-green-400" : "text-muted"}`}>{job.status}</span></div>)}
        {jobs.length === 0 && <div className="flex items-center gap-2 p-4 text-sm text-muted"><Shield size={16} />Aucune exécution enregistrée.</div>}
      </div>
    </div>
  );
}
