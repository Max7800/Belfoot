"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function MatchPage() {
  const { id } = useParams();
  const [m, setM] = useState(undefined);
  const [clubs, setClubs] = useState({});
  const [events, setEvents] = useState([]);
  const [players, setPlayers] = useState({});
  const [comp, setComp] = useState(null);
  useEffect(() => { (async () => {
    const { data: match } = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
    if (!match) { setM(null); return; }
    setM(match);
    const ids = [match.home_club_id, match.away_club_id].filter(Boolean);
    const [cl, ev, cp] = await Promise.all([
      supabase.from("clubs").select("id,name,logo_url").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("match_events").select("*").eq("match_id", id).order("minute", { ascending: true }),
      match.competition_id ? supabase.from("competitions").select("id,name").eq("id", match.competition_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setClubs(Object.fromEntries((cl.data || []).map((x) => [x.id, x]))); setEvents(ev.data || []); setComp(cp.data || null);
    const pids = [...new Set((ev.data || []).map((e) => e.player_id).filter(Boolean))];
    if (pids.length) { const { data: pl } = await supabase.from("players").select("id,name").in("id", pids); setPlayers(Object.fromEntries((pl || []).map((p) => [p.id, p.name]))); }
  })().catch(() => setM(null)); }, [id]);
  if (m === undefined) return <p className="text-muted">Chargement…</p>;
  if (m === null) return <p className="text-muted">Match introuvable.</p>;
  const h = clubs[m.home_club_id] || {}, a = clubs[m.away_club_id] || {};
  const icon = (t) => ({ goal: "⚽", assist: "🅰️", yellow: "🟨", red: "🟥", sub: "🔁" }[t] || "•");
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 text-center text-xs uppercase tracking-wider text-muted">{comp?.name}{m.matchday ? ` · Journée ${m.matchday}` : ""}</div>
      <div className="mb-6 flex items-center justify-center gap-4">
        <div className="flex flex-1 flex-col items-center gap-2">{h.logo_url && <img src={h.logo_url} className="h-14 w-14 object-contain" alt="" />}<span className="text-center font-semibold">{h.name}</span></div>
        <div className="shrink-0 text-center">
          <div className="text-3xl font-black tabular-nums">{m.home_score ?? "-"} : {m.away_score ?? "-"}</div>
          {m.status === "live" && <div className="text-xs font-bold text-red-500">● LIVE {m.minute ? m.minute + "'" : ""}</div>}
          {m.kickoff && <div className="text-[10px] text-muted">{new Date(m.kickoff).toLocaleString()}</div>}
        </div>
        <div className="flex flex-1 flex-col items-center gap-2">{a.logo_url && <img src={a.logo_url} className="h-14 w-14 object-contain" alt="" />}<span className="text-center font-semibold">{a.name}</span></div>
      </div>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Faits du match</h2>
      {events.length === 0
        ? <p className="text-sm text-muted">Aucun événement importé (lance « ⚽ Événements de match » dans l'admin).</p>
        : <div className="space-y-1">{events.map((e, i) => <div key={i} className="flex items-center gap-3 rounded border border-line/10 bg-surface p-2 text-sm"><span className="w-10 text-muted">{e.minute != null ? e.minute + "'" : ""}</span><span>{icon(e.type)}</span><span className="flex-1">{players[e.player_id] || "—"}</span>{clubs[e.club_id]?.logo_url && <img src={clubs[e.club_id].logo_url} className="h-5 w-5 object-contain" alt="" />}</div>)}</div>}
    </div>
  );
}
