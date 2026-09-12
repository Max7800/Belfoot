"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ImageField from "@/components/ui/ImageField";
import SaveStatus from "@/components/ui/SaveStatus";

export default function ClubsAdmin() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [status, setStatus] = useState("idle");
  const load = async () => { const { data } = await supabase.from("clubs").select("*").order("name"); setRows(data || []); };
  useEffect(() => { load(); }, []);
  const save = async () => {
    setStatus("saving");
    const { error } = await supabase.from("clubs").upsert(edit);
    setStatus(error ? "error" : "saved"); if (!error) { setEdit(null); load(); }
    setTimeout(() => setStatus("idle"), 2000);
  };
  const box = "w-full rounded border border-line/10 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent";
  if (edit) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Club</h2>
        <div className="flex items-center gap-3"><SaveStatus status={status} />
          <button onClick={() => setEdit(null)} className="text-sm text-muted">Annuler</button>
          <button onClick={save} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">Enregistrer</button></div></div>
      <input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Nom du club" className={box} />
      <input value={edit.short_name || ""} onChange={(e) => setEdit({ ...edit, short_name: e.target.value })} placeholder="Abréviation" className={box} />
      <div><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Logo</div><ImageField value={edit.logo_url} onChange={(v) => setEdit({ ...edit, logo_url: v })} /></div>
    </div>
  );
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Clubs</h2>
        <button onClick={() => setEdit({})} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">+ Club</button></div>
      <div className="divide-y divide-line/10 rounded-xl border border-line/10">
        {rows.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-3">
            {c.logo_url && <img src={c.logo_url} alt="" className="h-8 w-8 rounded object-contain" />}
            <div className="flex-1 font-semibold">{c.name}</div>
            <button onClick={() => setEdit(c)} className="text-sm text-muted hover:text-content">Éditer</button>
          </div>
        ))}
        {rows.length === 0 && <div className="p-4 text-sm text-muted">Aucun club.</div>}
      </div>
    </div>
  );
}
