"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import SaveStatus from "@/components/ui/SaveStatus";
import ImageField from "@/components/ui/ImageField";

export default function EntityManager({ spec }) {
  const { table, title, singular, fields, hasSource } = spec;
  const [rows, setRows] = useState([]);
  const [rel, setRel] = useState({});
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState("idle");
  const relFields = useMemo(() => fields.filter((f) => f.type === "relation"), [fields]);

  const load = async () => {
    let q = supabase.from(table).select("*");
    if (spec.orderBy) q = q.order(spec.orderBy, { ascending: spec.orderAsc !== false, nullsFirst: false });
    const { data } = await q;
    setRows(data || []);
  };
  useEffect(() => {
    load();
    const done = new Set();
    relFields.forEach(async (f) => {
      if (done.has(f.table)) return; done.add(f.table);
      const sel = f.labelCol === "id" ? "id" : `id, ${f.labelCol}`;
      const { data } = await supabase.from(f.table).select(sel).limit(1000);
      setRel((prev) => ({ ...prev, [f.table]: (data || []).map((r) => ({ id: r.id, label: f.labelCol === "id" ? String(r.id).slice(0, 8) : String(r[f.labelCol] ?? r.id) })) }));
    });
  }, [table]);

  const save = async () => {
    setStatus("saving");
    const { error } = await supabase.from(table).upsert(editing);
    if (error) { setStatus("error"); alert(error.message); } else { setStatus("saved"); setEditing(null); load(); }
    setTimeout(() => setStatus("idle"), 2000);
  };
  const remove = async (r) => { if (!confirm("Supprimer ?")) return; await supabase.from(table).delete().eq("id", r.id); load(); };
  const setV = (k, v) => setEditing((e) => ({ ...e, [k]: v }));
  const rowLabel = (r) => r.name || r.label || r.title || (r.id ? String(r.id).slice(0, 8) : "—");

  if (editing) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing.id ? "Modifier" : "Nouveau"} — {singular || title}</h2>
          <div className="flex items-center gap-3"><SaveStatus status={status} />
            <button onClick={() => setEditing(null)} className="text-sm text-muted">Annuler</button>
            <button onClick={save} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">Enregistrer</button></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => <Field key={f.key} f={f} value={editing[f.key]} onChange={(v) => setV(f.key, v)} options={rel[f.table]} />)}
        </div>
        {hasSource && (
          <div className="mt-4 rounded-lg border border-line/10 p-3 text-sm">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Données externes</div>
            <div className="flex flex-wrap items-center gap-4 text-muted">
              <span>source : <b className="text-content">{editing.source || "manual"}</b></span>
              <span>external_id : {editing.external_id || "—"}</span>
              <span>synchro : {editing.synced_at ? new Date(editing.synced_at).toLocaleString() : "—"}</span>
              <label className="flex items-center gap-2 text-content"><input type="checkbox" checked={!!editing.locked} onChange={(e) => setV("locked", e.target.checked)} />🔒 verrouillé (protège de la synchro)</label>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <button onClick={() => setEditing({})} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">+ {singular || "Ajouter"}</button>
      </div>
      <div className="divide-y divide-line/10 rounded-xl border border-line/10">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3">
            {(r.logo_url || r.photo_url) && <img src={r.logo_url || r.photo_url} alt="" className="h-8 w-8 rounded object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{rowLabel(r)}</div>
              {hasSource && <div className="text-xs text-muted">{r.locked ? "🔒 manuel" : (r.source || "manual")}{r.synced_at ? ` · synchro ${new Date(r.synced_at).toLocaleDateString()}` : ""}</div>}
            </div>
            <button onClick={() => setEditing(r)} className="text-sm text-muted hover:text-content">Éditer</button>
            <button onClick={() => remove(r)} className="text-sm text-red-400">Suppr.</button>
          </div>
        ))}
        {rows.length === 0 && <div className="p-4 text-sm text-muted">Aucune entrée. (Se remplira surtout via provider / sync.)</div>}
      </div>
    </div>
  );
}

function Field({ f, value, onChange, options }) {
  const label = <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">{f.label}</label>;
  const box = "w-full rounded border border-line/10 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent";
  if (f.type === "bool") return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{f.label}</label>;
  if (f.type === "image") return <div>{label}<ImageField value={value} onChange={onChange} /></div>;
  if (f.type === "relation") return <div>{label}<select value={value || ""} onChange={(e) => onChange(e.target.value || null)} className={box}><option value="">—</option>{(options || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>;
  if (f.type === "select") return <div>{label}<select value={value || ""} onChange={(e) => onChange(e.target.value)} className={box}><option value="">—</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></div>;
  if (f.type === "number") return <div>{label}<input type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className={box} /></div>;
  if (f.type === "datetime") return <div>{label}<input type="datetime-local" value={value ? String(value).slice(0, 16) : ""} onChange={(e) => onChange(e.target.value || null)} className={box} /></div>;
  if (f.type === "textarea") return <div>{label}<textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3} className={box} /></div>;
  return <div>{label}<input value={value || ""} onChange={(e) => onChange(e.target.value)} className={box} /></div>;
}
