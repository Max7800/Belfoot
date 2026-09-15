"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { computeStandings } from "@/lib/standings";

export default function ClassementPage() {
  const [comps, setComps] = useState([]); const [cid, setCid] = useState("");
  const [matches, setMatches] = useState([]); const [clubs, setClubs] = useState({}); const [phase, setPhase] = useState(null);
  useEffect(() => { supabase.from("competitions").select("*").order("name").then(({ data }) => { setComps(data || []); if (data?.[0]) setCid(data[0].id); }); }, []);
  useEffect(() => { if (!cid) return; (async () => {
    const { data: m } = await supabase.from("matches").select("*").eq("competition_id", cid);
    setMatches(m || []); setPhase(null);
    const ids = [...new Set((m || []).flatMap((x) => [x.home_club_id, x.away_club_id]).filter(Boolean))];
    if (ids.length) { const { data: cl } = await supabase.from("clubs").select("id,name,logo_url").in("id", ids); setClubs(Object.fromEntries((cl || []).map((x) => [x.id, x]))); }
  })().catch(() => {}); }, [cid]);
  const phases = useMemo(() => { const c = {}; for (const m of matches) { const p = m.phase || "—"; c[p] = (c[p] || 0) + 1; } return Object.keys(c).sort((a, b) => c[b] - c[a]); }, [matches]);
  const cur = phase || phases[0] || null;
  const finished = matches.filter((m) => (m.phase || "—") === cur && m.status === "finished" && m.home_score != null);
  const standings = useMemo(() => computeStandings(finished), [finished]);
  const name = (id) => clubs[id]?.name || "—";
  return (
    <div>
      <h1 className="mb-4 text-3xl font-black">Classement</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={cid} onChange={(e) => setCid(e.target.value)} className="rounded border border-line/10 bg-surface px-3 py-1.5 text-sm">{comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {phases.length > 1 && phases.map((p) => <button key={p} onClick={() => setPhase(p)} className={`rounded-full border px-3 py-1 text-xs ${cur === p ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{p}</button>)}
      </div>
      <div className="overflow-hidden rounded-xl border border-line/10">
        <table className="w-full text-sm">
          <thead className="bg-surface2 text-muted"><tr><th className="p-2 text-left">Club</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Diff</th><th>Pts</th></tr></thead>
          <tbody>
            {standings.map((r, i) => <tr key={r.club} className="border-t border-line/10 text-center"><td className="p-2 text-left"><Link href={`/clubs/${r.club}`} className="inline-flex items-center gap-2 hover:text-accent">{i + 1}. {clubs[r.club]?.logo_url && <img src={clubs[r.club].logo_url} className="h-5 w-5 object-contain" alt="" />}{name(r.club)}</Link></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.gd}</td><td className="font-bold">{r.pts}</td></tr>)}
            {standings.length === 0 && <tr><td colSpan="7" className="p-4 text-center text-muted">Classement vide.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
