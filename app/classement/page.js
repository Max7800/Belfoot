"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
export default function ClassementPage() {
  const [rows, setRows] = useState([]); const [clubs, setClubs] = useState([]);
  useEffect(() => { (async () => {
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("standings").select("*").order("points", { ascending: false }),
      supabase.from("clubs").select("id,name,logo_url"),
    ]);
    setRows(s || []); setClubs(c || []);
  })().catch(() => {}); }, []);
  const club = (id) => clubs.find((c) => c.id === id) || {};
  return (
    <div>
      <h1 className="mb-6 text-3xl font-black">Classement</h1>
      <div className="overflow-hidden rounded-xl border border-line/10">
        <table className="w-full text-sm">
          <thead className="bg-surface2 text-muted"><tr><th className="p-2 text-left">Club</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Diff</th><th>Pts</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.club_id} className="border-t border-line/10 text-center">
                <td className="flex items-center gap-2 p-2 text-left">{i + 1}. {club(r.club_id).name}</td>
                <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.goal_diff}</td><td className="font-bold">{r.points}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="7" className="p-4 text-center text-muted">Classement vide.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
