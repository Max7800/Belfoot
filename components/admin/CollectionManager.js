"use client";
import { useEffect, useRef, useState } from "react";
import { getCollection } from "@/config/collections";
import { listEntries, saveEntry, deleteEntry, reorderEntries } from "@/lib/entries";
import { slugify } from "@/lib/slugify";
import FieldInput from "./FieldInput";
import SaveStatus from "@/components/ui/SaveStatus";
import { exportCollectionJSON, importCollectionJSON, toCSV, download } from "@/lib/io";
import SortableList from "@/components/admin/SortableList";

// Mapping champ déclaré -> colonne de `entries` (le reste va dans data jsonb).
const COLUMN = { title: "title", slug: "slug", excerpt: "excerpt", body: "body", cover: "cover_url", images: "images", category: "category", published: "published", published_at: "published_at", seo: "seo" };
const getVal = (row, k) => (COLUMN[k] ? row[COLUMN[k]] : row.data?.[k]);
const setVal = (row, k, v) => (COLUMN[k] ? { ...row, [COLUMN[k]]: v } : { ...row, data: { ...(row.data || {}), [k]: v } });

export default function CollectionManager({ collectionKey }) {
  const col = getCollection(collectionKey);
  const fields = Object.entries(col.fields || {});
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState("idle");

  useEffect(() => { load(); }, [collectionKey]);
  async function load() { try { setItems(await listEntries(collectionKey)); } catch { setItems([]); } }
  const fileRef = useRef(null);
  const exportJSON = async () => download(`${collectionKey}.json`, await exportCollectionJSON(collectionKey));
  const exportCSV = async () => download(`${collectionKey}.csv`, toCSV(await listEntries(collectionKey)), "text/csv");
  const doImport = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await importCollectionJSON(collectionKey, await f.text()); load(); } catch (err) { alert(err.message); } e.target.value = ""; };

  async function save() {
    setStatus("saving");
    let row = { ...editing };
    for (const [k, f] of fields) {
      if (f.type === "slug" && !getVal(row, k)) row = setVal(row, k, slugify(getVal(row, f.from || "title") || ""));
    }
    try { await saveEntry(row); setStatus("saved"); setEditing(null); load(); }
    catch (e) { setStatus("error"); alert(e.message); }
    setTimeout(() => setStatus("idle"), 2000);
  }
  async function remove(it) { if (!confirm("Supprimer cette entrée ?")) return; await deleteEntry(it.id); load(); }

  const Row = ({ it }) => (
    <div className="flex items-center gap-3 p-3">
      {col.ordered && <span className="cursor-move select-none text-muted" title="Glisser pour réordonner">⠿</span>}
      {it.cover_url && <img src={it.cover_url} alt="" className="h-10 w-14 rounded object-cover" />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{it.title || "(sans titre)"}</div>
        <div className="text-xs text-muted">{it.published ? "Publié" : "Brouillon"}{it.category ? ` · ${it.category}` : ""}</div>
      </div>
      <button onClick={() => setEditing({ ...it, images: it.images || [], data: it.data || {}, seo: it.seo || {} })} className="text-sm text-muted hover:text-content">Éditer</button>
      <button onClick={() => remove(it)} className="text-sm text-red-400">Suppr.</button>
    </div>
  );

  if (editing) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing.id ? "Modifier" : "Nouveau"} — {col.labelSingular || col.label}</h2>
          <div className="flex items-center gap-3">
            <SaveStatus status={status} />
            <button onClick={() => setEditing(null)} className="text-sm text-muted">Annuler</button>
            <button onClick={save} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">Enregistrer</button>
          </div>
        </div>
        <div className="space-y-4">
          {fields.map(([k, f]) => <FieldInput key={k} field={f} scope={col.key} value={getVal(editing, k)} onChange={(v) => setEditing(setVal(editing, k, v))} />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">{col.label}</h2>
        <div className="flex items-center gap-2">
          <button onClick={exportJSON} className="rounded border border-line/20 px-2 py-1 text-xs text-muted hover:text-content">Export JSON</button>
          <button onClick={exportCSV} className="rounded border border-line/20 px-2 py-1 text-xs text-muted hover:text-content">CSV</button>
          <button onClick={() => fileRef.current?.click()} className="rounded border border-line/20 px-2 py-1 text-xs text-muted hover:text-content">Import</button>
          <input ref={fileRef} type="file" accept="application/json" onChange={doImport} className="hidden" />
          <button onClick={() => setEditing({ collection: col.key, images: [], data: {}, seo: {}, published: false, position: 0 })} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">+ Nouveau</button>
        </div>
      </div>
      <div className="divide-y divide-line/10 rounded-xl border border-line/10">
        {col.ordered
          ? <SortableList items={items} getId={(it) => it.id} onReorder={(next) => { setItems(next); reorderEntries(next.map((x) => x.id)); }}>{(it) => <Row it={it} />}</SortableList>
          : items.map((it) => <Row key={it.id} it={it} />)}
        {items.length === 0 && <div className="p-4 text-sm text-muted">Aucune entrée pour l'instant.</div>}
      </div>
    </div>
  );
}
