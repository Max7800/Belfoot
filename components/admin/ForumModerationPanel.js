"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const box = "rounded border border-line/10 bg-surface2 px-2 py-1.5 text-sm text-content";
const slugify = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function ForumModerationPanel() {
  const [categories, setCategories] = useState([]);
  const [topics, setTopics] = useState([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const [{ data: cats }, { data: tops }] = await Promise.all([
      supabase.from("forum_categories").select("id,name,slug,position").order("position"),
      supabase.from("forum_topics").select("id,title,author_name,pinned,locked,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    setCategories(cats || []); setTopics(tops || []);
  };
  useEffect(() => { load(); }, []);

  const addCat = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("forum_categories").insert({ name: name.trim(), slug: slugify(name), position: categories.length });
    if (error) setMsg(error.message); else { setName(""); load(); }
  };
  const patchCat = async (id, patch) => { await supabase.from("forum_categories").update(patch).eq("id", id); load(); };
  const delCat = async (id) => { if (confirm("Supprimer cette catégorie et tous ses sujets ?")) { await supabase.from("forum_categories").delete().eq("id", id); load(); } };
  const patchTopic = async (id, patch) => { await supabase.from("forum_topics").update(patch).eq("id", id); load(); };
  const delTopic = async (id) => { if (confirm("Supprimer ce sujet et ses messages ?")) { await supabase.from("forum_topics").delete().eq("id", id); load(); } };

  return (
    <div>
      <h2 className="mb-2 text-lg font-bold">Forum</h2>
      {msg && <p className="mb-3 text-sm text-red-300">{msg}</p>}

      <div className="mb-6 rounded-xl border border-line/10 bg-surface p-3">
        <div className="mb-2 text-xs font-semibold text-muted">Catégories</div>
        <div className="space-y-1">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <input defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && patchCat(c.id, { name: e.target.value, slug: slugify(e.target.value) })} className={`flex-1 ${box}`} />
              <input type="number" defaultValue={c.position} onBlur={(e) => patchCat(c.id, { position: Number(e.target.value) })} className={`w-16 ${box}`} />
              <button onClick={() => delCat(c.id)} className="px-2 text-muted hover:text-red-300">Suppr.</button>
            </div>
          ))}
          {categories.length === 0 && <p className="text-xs text-muted">Aucune catégorie. Crée la première ci-dessous.</p>}
        </div>
        <div className="mt-2 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nouvelle catégorie" className={`flex-1 ${box}`} />
          <button onClick={addCat} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-white">Ajouter</button>
        </div>
      </div>

      <div className="rounded-xl border border-line/10 bg-surface p-3">
        <div className="mb-2 text-xs font-semibold text-muted">Sujets récents (modération)</div>
        <div className="divide-y divide-line/10">
          {topics.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{t.title} <span className="text-[11px] text-muted">· {t.author_name || "Membre"}</span></span>
              <button onClick={() => patchTopic(t.id, { pinned: !t.pinned })} className={`rounded px-2 py-0.5 text-xs ${t.pinned ? "bg-amber-400/20 text-amber-300" : "text-muted hover:text-content"}`}>Épingler</button>
              <button onClick={() => patchTopic(t.id, { locked: !t.locked })} className={`rounded px-2 py-0.5 text-xs ${t.locked ? "bg-red-400/20 text-red-300" : "text-muted hover:text-content"}`}>Verrouiller</button>
              <button onClick={() => delTopic(t.id)} className="px-2 text-xs text-muted hover:text-red-300">Suppr.</button>
            </div>
          ))}
          {topics.length === 0 && <p className="py-2 text-xs text-muted">Aucun sujet.</p>}
        </div>
      </div>
    </div>
  );
}
