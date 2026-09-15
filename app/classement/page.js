"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { computeStandings } from "@/lib/standings";
import StandingsTable from "@/components/football/StandingsTable";
import { useLabels } from "@/lib/labels";

export default function ClassementPage() {
  const L = useLabels();
  const [comps, setComps] = useState([]); const [cid, setCid] = useState("");
  const [matches, setMatches] = useState([]); const [clubs, setClubs] = useState({}); const [phase, setPhase] = useState(null);
  useEffect(() => { supabase.from("competitions").select("*").order("position", { ascending: true, nullsFirst: false }).order("name").then(({ data }) => { setComps(data || []); if (data?.[0]) setCid(data[0].id); }); }, []);
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
  const zones = comps.find((c) => c.id === cid)?.zones || [];
  return (
    <div>
      <h1 className="mb-4 text-3xl font-black">{L("nav.classement", "Classement")}</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {comps.map((c) => (
          <button key={c.id} onClick={() => setCid(c.id)} className={`flex items-center gap-2 rounded-xl border p-2 pr-3 text-sm transition ${cid === c.id ? "border-accent bg-accent/10" : "border-line/10 bg-surface hover:border-accent/40"}`}>
            {c.logo_url && <img src={c.logo_url} className="h-7 w-7 object-contain" alt="" />}<span className="font-semibold">{c.name}</span>
          </button>
        ))}
      </div>
      {phases.length > 1 && <div className="mb-4 flex flex-wrap gap-1">{phases.map((p) => <button key={p} onClick={() => setPhase(p)} className={`rounded-full border px-3 py-1 text-xs ${cur === p ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{p}</button>)}</div>}
      <StandingsTable standings={standings} clubs={clubs} zones={zones} L={L} />
    </div>
  );
}
