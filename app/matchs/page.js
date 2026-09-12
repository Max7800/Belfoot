"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
export default function MatchsPage() {
  const [rows, setRows] = useState([]); const [clubs, setClubs] = useState([]);
  useEffect(() => { (async () => {
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from("matches").select("*").order("kickoff", { ascending: false }),
      supabase.from("clubs").select("id,name,logo_url"),
    ]);
    setRows(m || []); setClubs(c || []);
  })().catch(() => {}); }, []);
  const club = (id) => clubs.find((c) => c.id === id) || {};
  return (
    <div>
      <h1 className="mb-6 text-3xl font-black">Matchs</h1>
      <div className="space-y-2">
        {rows.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-3 text-sm">
            <span className="flex flex-1 items-center justify-end gap-2">{club(m.home_club_id).name}{club(m.home_club_id).logo_url && <img src={club(m.home_club_id).logo_url} className="h-6 w-6 object-contain" alt="" />}</span>
            <span className="rounded bg-surface2 px-2 py-1 font-bold">{m.home_score ?? "-"} : {m.away_score ?? "-"}</span>
            <span className="flex flex-1 items-center gap-2">{club(m.away_club_id).logo_url && <img src={club(m.away_club_id).logo_url} className="h-6 w-6 object-contain" alt="" />}{club(m.away_club_id).name}</span>
            {m.status === "live" && <span className="text-xs font-bold text-red-500">● LIVE {m.minute ? m.minute + "'" : ""}</span>}
          </div>
        ))}
        {rows.length === 0 && <p className="text-muted">Aucun match pour l'instant.</p>}
      </div>
    </div>
  );
}
