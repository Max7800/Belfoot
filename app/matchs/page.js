"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";
export default function MatchsPage() {
  const [rows, setRows] = useState([]); const [clubs, setClubs] = useState({});
  useEffect(() => { (async () => {
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from("matches").select("*").order("kickoff", { ascending: false }).limit(100),
      supabase.from("clubs").select("id,name,logo_url"),
    ]);
    setRows(m || []); setClubs(Object.fromEntries((c || []).map((x) => [x.id, x])));
  })().catch(() => {}); }, []);
  return (
    <div>
      <h1 className="mb-6 text-3xl font-black">Matchs</h1>
      <div className="space-y-2">
        {rows.map((m) => <MatchRow key={m.id} m={m} clubs={clubs} href={`/matchs/${m.id}`} />)}
        {rows.length === 0 && <p className="text-muted">Aucun match pour l'instant.</p>}
      </div>
    </div>
  );
}
