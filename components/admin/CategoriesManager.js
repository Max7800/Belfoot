"use client";
import { useEffect, useState } from "react";
import { collectionList } from "@/config/collections";
import { listCategories, saveCategory, deleteCategory } from "@/lib/categories";

export default function CategoriesManager() {
  const scopes = [...collectionList().map((c) => c.key), "shared"];
  const [scope, setScope] = useState(scopes[0] || "shared");
  const [cats, setCats] = useState([]);
  const load = () => listCategories(scope).then(setCats).catch(() => setCats([]));
  useEffect(() => { load(); }, [scope]);

  const add = () => saveCategory({ scope, name: "Nouvelle", color: "#1CA3DD", position: cats.length, active: true }).then(load);
  const patch = (c, k, v) => saveCategory({ ...c, [k]: v }).then(load);
  const move = async (i, dir) => {
    const j = i + dir; if (j < 0 || j >= cats.length) return;
    await saveCategory({ ...cats[i], position: j });
    await saveCategory({ ...cats[j], position: i });
    load();
  };
  const remove = (c) => { if (confirm("Supprimer cette catégorie ?")) deleteCategory(c.id).then(load); };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Catégories</h2>
        <div className="flex items-center gap-2">
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded border border-line/10 bg-surface2 px-2 py-1 text-sm">
            {scopes.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button onClick={add} className="rounded bg-accent px-3 py-1 text-sm font-bold text-white">+ Catégorie</button>
        </div>
      </div>
      <div className="space-y-2">
        {cats.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2 rounded border border-line/10 bg-surface p-2">
            <input type="color" value={c.color} onChange={(e) => patch(c, "color", e.target.value)} className="h-7 w-8 rounded bg-transparent" />
            <input value={c.name} onChange={(e) => setCats(cats.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} onBlur={(e) => patch(c, "name", e.target.value)} className="flex-1 rounded border border-line/10 bg-surface2 px-2 py-1 text-sm" />
            <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={c.active} onChange={(e) => patch(c, "active", e.target.checked)} />actif</label>
            <button onClick={() => move(i, -1)} className="px-1 text-muted hover:text-content">↑</button>
            <button onClick={() => move(i, 1)} className="px-1 text-muted hover:text-content">↓</button>
            <button onClick={() => remove(c)} className="px-1 text-red-400">✕</button>
          </div>
        ))}
        {cats.length === 0 && <p className="text-sm text-muted">Aucune catégorie pour « {scope} ».</p>}
      </div>
    </div>
  );
}
