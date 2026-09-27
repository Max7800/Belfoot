"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pin, Lock, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";

const rel = (d) => {
  if (!d) return "";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 604800) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(d).toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
};

export default function CategoryPage() {
  const { session, isAdmin } = useAuth();
  const userId = session?.user?.id || null;
  const { slug } = useParams();
  const router = useRouter();
  const [cat, setCat] = useState(null);
  const [topics, setTopics] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("forum_categories").select("id,name,slug,description").eq("slug", slug).maybeSingle();
      setCat(c || null);
      if (c) {
        const { data: tops } = await supabase.from("forum_topics").select("id,title,author_name,pinned,locked,last_activity,created_at").eq("category_id", c.id).order("pinned", { ascending: false }).order("last_activity", { ascending: false }).limit(100);
        setTopics(tops || []);
        const ids = (tops || []).map((t) => t.id);
        if (ids.length) {
          const { data: posts } = await supabase.from("forum_posts").select("topic_id,author_name,created_at").in("topic_id", ids).is("deleted_at", null).order("created_at");
          const m = {};
          for (const p of posts || []) {
            const cur = m[p.topic_id] || { count: 0, last: null };
            cur.count += 1; cur.last = { author_name: p.author_name, created_at: p.created_at };
            m[p.topic_id] = cur;
          }
          setMeta(m);
        }
      }
      setLoading(false);
    })();
  }, [slug]);

  const createTopic = async () => {
    if (!userId || !cat) return;
    if (!draft.title.trim() || !draft.body.trim()) { setErr("Titre et message requis."); return; }
    setBusy(true); setErr("");
    const { data: prof } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
    const author_name = prof?.username || "Membre";
    const { data: topic, error } = await supabase.from("forum_topics").insert({ category_id: cat.id, author: userId, title: draft.title.trim(), author_name }).select("id").single();
    if (error) { setErr(error.message); setBusy(false); return; }
    await supabase.from("forum_posts").insert({ topic_id: topic.id, author: userId, body: draft.body.trim(), author_name });
    setBusy(false);
    router.push(`/forum/${topic.id}`);
  };

  const modTopic = async (id, patch) => { await supabase.from("forum_topics").update(patch).eq("id", id); setTopics((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t))); };
  const delTopic = async (id) => { if (!confirm("Supprimer ce sujet et ses messages ?")) return; await supabase.from("forum_topics").delete().eq("id", id); setTopics((ts) => ts.filter((t) => t.id !== id)); };

  if (loading) return <div className="mx-auto max-w-3xl py-10 text-center text-muted">Chargement…</div>;
  if (!cat) return <div className="mx-auto max-w-3xl py-10 text-center text-muted">Catégorie introuvable. <Link href="/forum" className="text-accent">Retour au Noyau</Link></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/forum" className="inline-flex items-center gap-1 text-sm text-muted hover:text-content"><ArrowLeft className="h-4 w-4" />Le Noyau</Link>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line/10 bg-gradient-to-r from-surface to-bg/40 p-4 sm:p-5">
        <div>
          <h1 className="text-2xl font-black">{cat.name}</h1>
          {cat.description && <p className="text-sm text-muted">{cat.description}</p>}
        </div>
        {userId && <button onClick={() => { setCreating((v) => !v); setErr(""); }} className="ml-auto inline-flex items-center gap-1 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4" />Nouveau sujet</button>}
      </div>
      {!userId && <p className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-sm text-amber-200">Connecte-toi pour lancer un sujet ou répondre.</p>}

      {creating && userId && (
        <div className="rounded-2xl border border-accent/20 bg-surface p-4 sm:p-5">
          <div className="mb-3 text-sm font-black">Lancer une nouvelle discussion</div>
          {err && <p className="mb-2 text-sm text-red-300">{err}</p>}
          <input value={draft.title} maxLength={140} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Un titre clair et précis" className="mb-2 w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent/50" />
          <textarea value={draft.body} maxLength={10000} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows="5" placeholder="Présente le sujet, ton avis ou ta question…" className="w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm leading-6 outline-none focus:border-accent/50" />
          <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-muted">{draft.body.length}/10 000 caractères</span><button onClick={createTopic} disabled={busy} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Publication…" : "Publier le sujet"}</button></div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line/10 bg-surface">
        <div className="hidden grid-cols-[minmax(0,1fr)_90px_190px] gap-3 border-b border-line/10 bg-bg/30 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-muted sm:grid"><span>Discussion / auteur</span><span className="text-center">Messages</span><span>Dernière activité</span></div>
        <div className="divide-y divide-line/10">
        {topics.map((t) => (
          <div key={t.id} className="group relative flex items-center gap-3 px-4 py-3 transition hover:bg-surface2/70 sm:grid sm:grid-cols-[minmax(0,1fr)_90px_190px]">
            <Link href={`/forum/${t.id}`} className="absolute inset-0" aria-label={t.title} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {t.pinned && <Pin className="h-3.5 w-3.5 flex-shrink-0 text-amber-300" />}
                {t.locked && <Lock className="h-3.5 w-3.5 flex-shrink-0 text-muted" />}
                <span className="truncate font-bold">{t.title}</span>
              </div>
              <div className="truncate text-[11px] text-muted">lancé par {t.author_name || "Membre"} · {rel(t.created_at)}</div>
            </div>
            <div className="flex-shrink-0 text-right text-[11px] text-muted sm:text-center"><b className="text-content">{(meta[t.id]?.count || 1)}</b><span className="ml-1 sm:hidden">msg</span></div>
            <div className="hidden min-w-0 text-[11px] text-muted sm:block">{meta[t.id]?.last ? <><div className="truncate font-semibold text-content">{meta[t.id].last.author_name || "Membre"}</div><div>{rel(meta[t.id].last.created_at)}</div></> : <span>Aucune réponse</span>}</div>
            {isAdmin && (
              <div className="relative z-10 flex flex-shrink-0 gap-2 text-[11px] font-bold sm:absolute sm:right-3 sm:top-2" onClick={(e) => e.preventDefault()}>
                <button onClick={() => modTopic(t.id, { pinned: !t.pinned })} className={t.pinned ? "text-amber-300" : "text-muted hover:text-content"} title="Épingler">📌</button>
                <button onClick={() => modTopic(t.id, { locked: !t.locked })} className={t.locked ? "text-red-300" : "text-muted hover:text-content"} title="Verrouiller">🔒</button>
                <button onClick={() => delTopic(t.id)} className="text-muted hover:text-red-300" title="Supprimer">✕</button>
              </div>
            )}
          </div>
        ))}
        {topics.length === 0 && <div className="p-4 text-sm text-muted">Aucun sujet ici. Sois le premier à lancer la discussion !</div>}
        </div>
      </div>
    </div>
  );
}
