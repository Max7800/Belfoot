"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import SaveStatus from "@/components/ui/SaveStatus";
import ImageField from "@/components/ui/ImageField";
import { slugify } from "@/lib/slugify";

const POS = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };

export default function EntityManager({ spec }) {
  const { table, title, singular, fields, hasSource } = spec;
  const [rows, setRows] = useState([]);
  const [rel, setRel] = useState({});
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState("idle");
  const [q, setQ] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const relFields = useMemo(() => fields.filter((f) => f.type === "relation"), [fields]);

  const load = async () => {
    let query = supabase.from(table).select("*");
    if (spec.orderBy) query = query.order(spec.orderBy, { ascending: spec.orderAsc !== false, nullsFirst: false });
    const { data } = await query; setRows(data || []);
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
    const row = { ...editing };
    if (spec.slugFrom && !row.slug) row.slug = slugify(row[spec.slugFrom] || "");
    const { error } = await supabase.from(table).upsert(row);
    if (error) { setStatus("error"); alert(error.message); } else { setStatus("saved"); setEditing(null); load(); }
    setTimeout(() => setStatus("idle"), 2000);
  };
  const remove = async (r) => { if (!confirm("Supprimer ?")) return; await supabase.from(table).delete().eq("id", r.id); load(); };
  const setV = (k, v) => setEditing((e) => ({ ...e, [k]: v }));
  const rowLabel = (r) => r.name || r.label || r.title || (r.id ? String(r.id).slice(0, 8) : "—");
  const relLabelOf = (relTable, id) => (rel[relTable] || []).find((o) => o.id === id)?.label || "Sans club / non associé";

  const Row = ({ it }) => (
    <div className="flex items-center gap-3 p-3">
      {(it.logo_url || it.photo_url) && <img src={it.logo_url || it.photo_url} alt="" className="h-8 w-8 rounded object-cover" />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{rowLabel(it)}</div>
        <div className="text-xs text-muted">
          {it.position ? it.position + " · " : ""}{hasSource ? (it.locked ? "🔒 manuel" : (it.source || "manual")) : ""}{it.tracked ? " · suivi" : ""}
        </div>
      </div>
      <button onClick={() => setEditing({ ...it, images: it.images || [], data: it.data || {}, seo: it.seo || {} })} className="text-sm text-muted hover:text-content">Éditer</button>
      <button onClick={() => remove(it)} className="text-sm text-red-400">Suppr.</button>
    </div>
  );

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
              <label className="flex items-center gap-2 text-content"><input type="checkbox" checked={!!editing.locked} onChange={(e) => setV("locked", e.target.checked)} />🔒 verrouillé</label>
            </div>
          </div>
        )}
      </div>
    );
  }

  // filtrage + regroupement
  let list = rows;
  if (spec.search && q.trim()) list = list.filter((r) => (r.name || "").toLowerCase().includes(q.toLowerCase()));
  const gb = spec.groupBy;
  let groups = null;
  if (gb) {
    if (groupFilter !== "all") list = list.filter((r) => String(r[gb.field] || "") === (groupFilter === "none" ? "" : groupFilter));
    const map = new Map();
    for (const r of list) { const key = r[gb.field] || "__none__"; (map.get(key) || map.set(key, []).get(key)).push(r); }
    groups = [...map.entries()].map(([key, items]) => ({
      key, label: key === "__none__" ? "Sans club / non associé" : relLabelOf(gb.relTable, key),
      items: items.sort((a, b) => (POS[a.position] ?? 9) - (POS[b.position] ?? 9) || (a.name || "").localeCompare(b.name || "")),
    })).sort((a, b) => a.label.localeCompare(b.label));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {spec.search && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="rounded border border-line/10 bg-surface2 px-2 py-1 text-xs" />}
          {gb && <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="rounded border border-line/10 bg-surface2 px-2 py-1 text-xs"><option value="all">Tous les clubs</option>{(rel[gb.relTable] || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}<option value="none">Sans club</option></select>}
          <button onClick={() => setEditing({ collection: spec.collection })} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">+ {singular || "Ajouter"}</button>
        </div>
      </div>
      {groups ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-1 flex items-center gap-2 text-sm font-bold">{g.label} <span className="text-xs font-normal text-muted">({g.items.length})</span></div>
              <div className="divide-y divide-line/10 rounded-xl border border-line/10">{g.items.map((it) => <Row key={it.id} it={it} />)}</div>
            </div>
          ))}
          {groups.length === 0 && <div className="p-4 text-sm text-muted">Aucune entrée.</div>}
        </div>
      ) : (
        <div className="divide-y divide-line/10 rounded-xl border border-line/10">
          {list.map((it) => <Row key={it.id} it={it} />)}
          {list.length === 0 && <div className="p-4 text-sm text-muted">Aucune entrée. (Se remplira surtout via provider / sync.)</div>}
        </div>
      )}
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
  if (f.type === "zones") {
    const arr = Array.isArray(value) ? value : [];
    const upd = (i, k, v) => onChange(arr.map((z, j) => (j === i ? { ...z, [k]: v } : z)));
    return (<div>{label}<div className="space-y-1">{arr.map((z, i) => (
      <div key={i} className="flex items-center gap-1">
        <input value={z.label || ""} onChange={(e) => upd(i, "label", e.target.value)} placeholder="Label (ex. Ligue des Champions)" className="flex-1 rounded border border-line/10 bg-surface2 px-2 py-1 text-xs" />
        <input type="color" value={z.color || "#3b82f6"} onChange={(e) => upd(i, "color", e.target.value)} className="h-7 w-8 rounded bg-transparent" />
        <input type="number" value={z.from ?? ""} onChange={(e) => upd(i, "from", Number(e.target.value))} placeholder="de" className="w-12 rounded border border-line/10 bg-surface2 px-1 py-1 text-xs" />
        <input type="number" value={z.to ?? ""} onChange={(e) => upd(i, "to", Number(e.target.value))} placeholder="à" className="w-12 rounded border border-line/10 bg-surface2 px-1 py-1 text-xs" />
        <button type="button" onClick={() => onChange(arr.filter((_, j) => j !== i))} className="px-1 text-red-400">×</button>
      </div>))}
      <button type="button" onClick={() => onChange([...arr, { label: "", color: "#3b82f6", from: 1, to: 1 }])} className="rounded border border-line/20 px-2 py-1 text-xs text-muted hover:text-content">+ zone</button>
    </div></div>);
  }
  if (f.type === "textarea") return <div>{label}<textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3} className={box} /></div>;
  return <div>{label}<input value={value || ""} onChange={(e) => onChange(e.target.value)} className={box} /></div>;
}
