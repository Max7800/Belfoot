"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessagesSquare, Pin, Lock, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";

export default function ForumPage() {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [topics, setTopics] = useState([]);
  const [meta, setMeta] = useState({}); // topic_id -> { count, last }
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ category_id: "", title: "", body: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: cats }, { data: tops }] = await Promise.all([
      supabase.from("forum_categories").select("id,name,slug,position").order("position"),
      supabase.from("forum_topics").select("id,category_id,title,author_name,pinned,locked,created_at").order("created_at", { ascending: false }),
    ]);
    setCategories(cats || []);
    setTopics(tops || []);
    const ids = (tops || []).map((t) => t.id);
    if (ids.length) {
      const { data: posts } = await supabase.from("forum_posts").select("topic_id,created_at").in("topic_id", ids);
      const m = {};
      for (const p of posts || []) {
        const cur = m[p.topic_id] || { count: 0, last: null };
        cur.count += 1;
        if (!cur.last || p.created_at > cur.last) cur.last = p.created_at;
        m[p.topic_id] = cur;
      }
      setMeta(m);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const byCategory = useMemo(() => {
    const map = {};
    for (const t of topics) (map[t.category_id] = map[t.category_id] || []).push(t);
    for (const k of Object.keys(map)) map[k].sort((a, b) => (b.pinned - a.pinned) || ((meta[b.id]?.last || b.created_at) > (meta[a.id]?.last || a.created_at) ? 1 : -1));
    return map;
  }, [topics, meta]);

  const createTopic = async () => {
    if (!userId) return;
    if (!draft.category_id || !draft.title.trim() || !draft.body.trim()) { setErr("Catégorie, titre et message sont requis."); return; }
    setBusy(true); setErr("");
    const { data: prof } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
    const author_name = prof?.username || "Membre";
    const { data: topic, error } = await supabase.from("forum_topics").insert({ category_id: draft.category_id, author: userId, title: draft.title.trim(), author_name }).select("id").single();
    if (error) { setErr(error.message); setBusy(false); return; }
    await supabase.from("forum_posts").insert({ topic_id: topic.id, author: userId, body: draft.body.trim(), author_name });
    setBusy(false);
    router.push(`/forum/${topic.id}`);
  };

  if (loading) return <div className="mx-auto max-w-3xl py-10 text-center text-muted">Chargement…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <MessagesSquare className="h-7 w-7 text-accent" />
        <h1 className="text-3xl font-black">Forum</h1>
        {userId && <button onClick={() => { setCreating((v) => !v); setErr(""); }} className="ml-auto inline-flex items-center gap-1 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4" />Nouveau sujet</button>}
      </div>
      {!userId && <p className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-sm text-amber-200">Connecte-toi pour créer un sujet ou répondre.</p>}

      {creating && userId && (
        <div className="rounded-2xl border border-line/15 bg-surface p-4">
          <div className="mb-2 text-sm font-bold">Nouveau sujet</div>
          {err && <p className="mb-2 text-sm text-red-300">{err}</p>}
          <div className="space-y-2">
            <select value={draft.category_id} onChange={(e) => setDraft({ ...draft, category_id: e.target.value })} className="w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm"><option value="">Catégorie…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Titre du sujet" className="w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm" />
            <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows="4" placeholder="Ton message…" className="w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm" />
            <button onClick={createTopic} disabled={busy} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Publication…" : "Publier le sujet"}</button>
          </div>
        </div>
      )}

      {categories.length === 0 && <p className="rounded-2xl border border-dashed border-line/15 p-6 text-center text-sm text-muted">Aucune catégorie pour l'instant.</p>}

      {categories.map((cat) => (
        <div key={cat.id}>
          <h2 className="mb-2 text-lg font-black">{cat.name}</h2>
          <div className="divide-y divide-line/10 rounded-2xl border border-line/10 bg-surface">
            {(byCategory[cat.id] || []).map((t) => (
              <Link key={t.id} href={`/forum/${t.id}`} className="flex items-center gap-3 p-3 transition hover:bg-surface2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {t.pinned && <Pin className="h-3.5 w-3.5 text-amber-300" />}
                    {t.locked && <Lock className="h-3.5 w-3.5 text-muted" />}
                    <span className="truncate font-bold">{t.title}</span>
                  </div>
                  <div className="text-[11px] text-muted">par {t.author_name || "Membre"}</div>
                </div>
                <div className="flex-shrink-0 text-right text-[11px] text-muted">{(meta[t.id]?.count || 1)} msg</div>
              </Link>
            ))}
            {(byCategory[cat.id] || []).length === 0 && <div className="p-3 text-sm text-muted">Aucun sujet — sois le premier !</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
