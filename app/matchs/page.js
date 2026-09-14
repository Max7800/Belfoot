"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";

export default function MatchsPage() {
  const [rows, setRows] = useState([]); const [clubs, setClubs] = useState({}); const [md, setMd] = useState("all");
  useEffect(() => { (async () => {
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from("matches").select("*").order("matchday", { ascending: true }).order("kickoff", { ascending: true }).limit(500),
      supabase.from("clubs").select("id,name,logo_url"),
    ]);
    setRows(m || []); setClubs(Object.fromEntries((c || []).map((x) => [x.id, x])));
  })().catch(() => {}); }, []);
  const matchdays = useMemo(() => [...new Set(rows.map((m) => m.matchday).filter((x) => x != null))].sort((a, b) => a - b), [rows]);
  const shown = md === "all" ? rows : rows.filter((m) => String(m.matchday) === String(md));
  const grouped = useMemo(() => { const g = {}; for (const m of shown) { (g[m.matchday ?? "?"] ||= []).push(m); } return g; }, [shown]);
  return (
    <div>
      <h1 className="mb-6 text-3xl font-black">Matchs</h1>
      {matchdays.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1">
          <button onClick={() => setMd("all")} className={`rounded-full border px-3 py-1 text-xs ${md === "all" ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>Toutes</button>
          {matchdays.map((d) => <button key={d} onClick={() => setMd(d)} className={`rounded-full border px-3 py-1 text-xs ${String(md) === String(d) ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>J{d}</button>)}
        </div>
      )}
      {Object.keys(grouped).sort((a, b) => a - b).map((k) => (
        <div key={k} className="mb-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Journée {k}</div>
          <div className="space-y-2">{grouped[k].map((m) => <MatchRow key={m.id} m={m} clubs={clubs} href={`/matchs/${m.id}`} />)}</div>
        </div>
      ))}
      {shown.length === 0 && <p className="text-muted">Aucun match.</p>}
    </div>
  );
}
