"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import siteConfig from "@/config/site";
import { jobKeys } from "@/lib/jobs";

export function ProfilesPanel() {
  const [rows, setRows] = useState([]);
  const load = () => supabase.from("profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, []);
  const setRole = async (r, role) => { await supabase.from("profiles").update({ role }).eq("id", r.id); load(); };
  return (<div><h2 className="mb-4 text-lg font-bold">Profils</h2>
    <div className="divide-y divide-line/10 rounded-xl border border-line/10">
      {rows.map((r) => <div key={r.id} className="flex items-center gap-3 p-3 text-sm"><span className="flex-1 truncate">{r.username || String(r.id).slice(0, 8)}</span>
        <select value={r.role} onChange={(e) => setRole(r, e.target.value)} className="rounded border border-line/10 bg-surface2 px-2 py-1 text-xs"><option>member</option><option>admin</option></select></div>)}
      {rows.length === 0 && <div className="p-4 text-sm text-muted">Aucun profil.</div>}
    </div></div>);
}

export function ReportsPanel() {
  const [rows, setRows] = useState([]);
  const load = () => supabase.from("reports").select("*").eq("status", "open").order("created_at", { ascending: false }).then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, []);
  const act = async (r, status) => { await supabase.from("reports").update({ status }).eq("id", r.id); load(); };
  return (<div><h2 className="mb-4 text-lg font-bold">Signalements <span className="text-sm font-normal text-muted">({rows.length})</span></h2>
    <div className="divide-y divide-line/10 rounded-xl border border-line/10">
      {rows.map((r) => <div key={r.id} className="flex items-center gap-3 p-3 text-sm"><span className="flex-1">{r.target_type} · {r.reason || "(sans motif)"}</span>
        <button onClick={() => act(r, "resolved")} className="text-green-400">Traiter</button><button onClick={() => act(r, "dismissed")} className="text-muted">Ignorer</button></div>)}
      {rows.length === 0 && <div className="p-4 text-sm text-muted">Aucun signalement.</div>}
    </div></div>);
}

export function JobsPanel() {
  const [rows, setRows] = useState([]);
  useEffect(() => { supabase.from("job_runs").select("*").order("started_at", { ascending: false }).limit(30).then(({ data }) => setRows(data || [])); }, []);
  return (<div><h2 className="mb-4 text-lg font-bold">Jobs</h2>
    <p className="mb-3 text-xs text-muted">Jobs déclarés : {jobKeys().join(", ") || "—"}. Exécution côté serveur (cron / endpoint protégé /api/jobs).</p>
    <div className="divide-y divide-line/10 rounded-xl border border-line/10">
      {rows.map((j) => <div key={j.id} className="flex items-center justify-between p-3 text-sm"><span>{j.job_key} · {new Date(j.started_at).toLocaleString()}</span><span className={j.status === "error" ? "text-red-400" : j.status === "ok" ? "text-green-400" : "text-muted"}>{j.status}</span></div>)}
      {rows.length === 0 && <div className="p-4 text-sm text-muted">Aucune exécution.</div>}
    </div></div>);
}
export const SyncHistoryPanel = JobsPanel;

export function ProvidersPanel() {
  const [comps, setComps] = useState([]);
  useEffect(() => { supabase.from("competitions").select("id,name,provider").then(({ data }) => setComps(data || [])); }, []);
  return (<div><h2 className="mb-4 text-lg font-bold">Providers</h2>
    <p className="mb-3 text-xs text-muted">Chaque compétition peut avoir son provider (multi-sources). Les providers réels se branchent via le contrat football/providers.js.</p>
    <div className="divide-y divide-line/10 rounded-xl border border-line/10">
      {comps.map((c) => <div key={c.id} className="flex items-center justify-between p-3 text-sm"><span>{c.name}</span><span className="text-muted">{c.provider || "— (manuel)"}</span></div>)}
      {comps.length === 0 && <div className="p-4 text-sm text-muted">Aucune compétition. Crée-en dans Football → Compétitions.</div>}
    </div></div>);
}

export function SettingsInfo({ which }) {
  const data = which === "modules" ? siteConfig.modules : which === "flags" ? siteConfig.flags : siteConfig;
  return (<div><h2 className="mb-4 text-lg font-bold capitalize">{which}</h2>
    <pre className="overflow-auto rounded-xl border border-line/10 bg-surface p-4 text-xs text-muted">{JSON.stringify(data, null, 2)}</pre>
    <p className="mt-2 text-xs text-muted">Édition via config/site.js (repo) pour l'instant ; panneau d'édition en admin à venir.</p></div>);
}

export function Placeholder({ title }) {
  return <div><h2 className="mb-2 text-lg font-bold capitalize">{title}</h2><p className="text-sm text-muted">Panneau en place — version minimale. On l'enrichit au fil du chantier.</p></div>;
}
