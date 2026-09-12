"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import SaveStatus from "@/components/ui/SaveStatus";

const STATUS = ["scheduled", "live", "finished", "postponed"];
export default function MatchesAdmin() {
  const [rows, setRows] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [edit, setEdit] = useState(null);
  const [status, setStatus] = useState("idle");
  const load = async () => {
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from("matches").select("*").order("kickoff", { ascending: false }),
      supabase.from("clubs").select("id,name").order("name"),
    ]);
    setRows(m || []); setClubs(c || []);
  };
  useEffect(() => { load(); }, []);
  const nameOf = (id) => clubs.find((c) => c.id === id)?.name || "?";
  const save = async () => {
    setStatus("saving");
    const { error } = await supabase.from("matches").upsert({ source: "manual", ...edit });
    setStatus(error ? "error" : "saved"); if (!error) { setEdit(null); load(); }
    setTimeout(() => setStatus("idle"), 2000);
  };
  const box = "rounded border border-line/10 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent";
  if (edit) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Match</h2>
        <div className="flex items-center gap-3"><SaveStatus status={status} />
          <button onClick={() => setEdit(null)} className="text-sm text-muted">Annuler</button>
          <button onClick={save} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">Enregistrer</button></div></div>
      <div className="grid grid-cols-2 gap-3">
        <select value={edit.home_club_id || ""} onChange={(e) => setEdit({ ...edit, home_club_id: e.target.value })} className={box}><option value="">Domicile…</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={edit.away_club_id || ""} onChange={(e) => setEdit({ ...edit, away_club_id: e.target.value })} className={box}><option value="">Extérieur…</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input type="number" value={edit.home_score ?? ""} onChange={(e) => setEdit({ ...edit, home_score: e.target.value === "" ? null : +e.target.value })} placeholder="Score dom." className={box} />
        <input type="number" value={edit.away_score ?? ""} onChange={(e) => setEdit({ ...edit, away_score: e.target.value === "" ? null : +e.target.value })} placeholder="Score ext." className={box} />
        <select value={edit.status || "scheduled"} onChange={(e) => setEdit({ ...edit, status: e.target.value })} className={box}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
        <input type="number" value={edit.matchday ?? ""} onChange={(e) => setEdit({ ...edit, matchday: e.target.value === "" ? null : +e.target.value })} placeholder="Journée" className={box} />
      </div>
    </div>
  );
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Matchs</h2>
        <button onClick={() => setEdit({ status: "scheduled" })} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">+ Match</button></div>
      <div className="divide-y divide-line/10 rounded-xl border border-line/10">
        {rows.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-3 text-sm">
            <span className="flex-1 text-right">{nameOf(m.home_club_id)}</span>
            <span className="font-bold">{m.home_score ?? "-"} : {m.away_score ?? "-"}</span>
            <span className="flex-1">{nameOf(m.away_club_id)}</span>
            <span className="w-20 text-xs text-muted">{m.status}</span>
            <button onClick={() => setEdit(m)} className="text-muted hover:text-content">Éditer</button>
          </div>
        ))}
        {rows.length === 0 && <div className="p-4 text-sm text-muted">Aucun match.</div>}
      </div>
    </div>
  );
}
