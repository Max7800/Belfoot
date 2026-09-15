"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";

export default function MatchsPage() {
  const [comps, setComps] = useState([]); const [cid, setCid] = useState("");
  const [matches, setMatches] = useState([]); const [clubs, setClubs] = useState({});
  const [phase, setPhase] = useState(null); const [round, setRound] = useState("all");
  useEffect(() => { supabase.from("competitions").select("*").order("position", { ascending: true, nullsFirst: false }).order("name").then(({ data }) => { setComps(data || []); if (data?.[0]) setCid(data[0].id); }); }, []);
  useEffect(() => { if (!cid) return; (async () => {
    const { data: m } = await supabase.from("matches").select("*").eq("competition_id", cid).order("round_number", { ascending: true, nullsFirst: false }).order("kickoff", { ascending: true });
    setMatches(m || []); setPhase(null); setRound("all");
    const ids = [...new Set((m || []).flatMap((x) => [x.home_club_id, x.away_club_id]).filter(Boolean))];
    if (ids.length) { const { data: cl } = await supabase.from("clubs").select("id,name,logo_url").in("id", ids); setClubs(Object.fromEntries((cl || []).map((x) => [x.id, x]))); }
  })().catch(() => {}); }, [cid]);
  const phases = useMemo(() => { const c = {}; for (const m of matches) { const p = m.phase || "—"; c[p] = (c[p] || 0) + 1; } return Object.keys(c).sort((a, b) => c[b] - c[a]); }, [matches]);
  const cur = phase || phases[0] || null;
  const pm = matches.filter((m) => (m.phase || "—") === cur);
  const rounds = useMemo(() => { const seen = new Map(); for (const m of pm) { const k = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); if (!seen.has(k)) seen.set(k, { key: k, num: m.round_number, label: m.round_number != null ? `Journée ${m.round_number}` : (m.round_raw || "Tour") }); } return [...seen.values()].sort((a, b) => (a.num ?? 999) - (b.num ?? 999)); }, [pm]);
  const shown = round === "all" ? pm : pm.filter((m) => (m.round_number != null ? String(m.round_number) : (m.round_raw || "?")) === round);
  const grouped = useMemo(() => { const g = {}; for (const m of shown) { const k = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); (g[k] ||= { label: m.round_number != null ? `Journée ${m.round_number}` : (m.round_raw || "Tour"), num: m.round_number, items: [] }).items.push(m); } return Object.values(g).sort((a, b) => (a.num ?? 999) - (b.num ?? 999)); }, [shown]);
  return (
    <div>
      <h1 className="mb-4 text-3xl font-black">Matchs</h1>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {comps.map((c) => (
            <button key={c.id} onClick={() => setCid(c.id)} className={`flex items-center gap-2 rounded-xl border p-2 pr-3 text-sm transition ${cid === c.id ? "border-accent bg-accent/10" : "border-line/10 bg-surface hover:border-accent/40"}`}>
              {c.logo_url && <img src={c.logo_url} className="h-7 w-7 object-contain" alt="" />}
              <span className="font-semibold">{c.name}</span>
            </button>
          ))}
        </div>
        {phases.length > 1 && phases.map((p) => <button key={p} onClick={() => { setPhase(p); setRound("all"); }} className={`rounded-full border px-3 py-1 text-xs ${cur === p ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{p}</button>)}
      </div>
      {rounds.length > 1 && <div className="mb-4 flex flex-wrap gap-1"><button onClick={() => setRound("all")} className={`rounded-full border px-3 py-1 text-xs ${round === "all" ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>Tout</button>{rounds.map((r) => <button key={r.key} onClick={() => setRound(r.key)} className={`rounded-full border px-3 py-1 text-xs ${round === r.key ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{r.num != null ? `J${r.num}` : r.label}</button>)}</div>}
      {grouped.map((g) => <div key={g.label} className="mb-5"><div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{g.label}</div><div className="space-y-2">{g.items.map((m) => <MatchRow key={m.id} m={m} clubs={clubs} href={`/matchs/${m.id}`} />)}</div></div>)}
      {shown.length === 0 && <p className="text-muted">Aucun match.</p>}
    </div>
  );
}
