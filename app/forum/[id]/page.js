"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Pin, Lock, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";

export default function TopicPage() {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const { id } = useParams();
  const [topic, setTopic] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const loadPosts = async () => {
    const { data } = await supabase.from("forum_posts").select("id,author_name,body,created_at").eq("topic_id", id).is("deleted_at", null).order("created_at");
    setPosts(data || []);
  };
  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("forum_topics").select("id,title,author_name,pinned,locked,created_at").eq("id", id).maybeSingle();
      setTopic(t || null);
      if (t) await loadPosts();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const reply = async () => {
    if (!userId || !body.trim() || topic?.locked) return;
    setBusy(true);
    const { data: prof } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
    const { error } = await supabase.from("forum_posts").insert({ topic_id: id, author: userId, body: body.trim(), author_name: prof?.username || "Membre" });
    if (!error) { setBody(""); await loadPosts(); }
    setBusy(false);
  };

  if (loading) return <div className="mx-auto max-w-3xl py-10 text-center text-muted">Chargement…</div>;
  if (!topic) return <div className="mx-auto max-w-3xl py-10 text-center text-muted">Sujet introuvable. <Link href="/forum" className="text-accent">Retour au forum</Link></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/forum" className="inline-flex items-center gap-1 text-sm text-muted hover:text-content"><ArrowLeft className="h-4 w-4" />Forum</Link>
      <div className="flex items-center gap-2">
        {topic.pinned && <Pin className="h-4 w-4 text-amber-300" />}
        {topic.locked && <Lock className="h-4 w-4 text-muted" />}
        <h1 className="text-2xl font-black">{topic.title}</h1>
      </div>

      <div className="space-y-3">
        {posts.map((p) => (
          <div key={p.id} className="rounded-2xl border border-line/10 bg-surface p-4">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
              <span className="font-bold text-content">{p.author_name || "Membre"}</span>
              <span>{new Date(p.created_at).toLocaleString("fr-BE", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
            <div className="whitespace-pre-wrap text-sm">{p.body}</div>
          </div>
        ))}
      </div>

      {topic.locked ? (
        <p className="rounded-xl border border-line/15 bg-surface p-3 text-sm text-muted"><Lock className="mr-2 inline h-4 w-4" />Ce sujet est verrouillé.</p>
      ) : userId ? (
        <div className="rounded-2xl border border-line/15 bg-surface p-4">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows="3" placeholder="Répondre…" className="w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm" />
          <button onClick={reply} disabled={busy || !body.trim()} className="mt-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Envoi…" : "Répondre"}</button>
        </div>
      ) : (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-sm text-amber-200">Connecte-toi pour répondre.</p>
      )}
    </div>
  );
}
