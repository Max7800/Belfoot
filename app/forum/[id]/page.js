"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Pin, Lock, ArrowLeft, ChevronRight, Flag, MessageSquareReply, Pencil, Quote, Send, Shield, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import ForumPostBody from "@/components/forum/ForumPostBody";

const replyExcerpt = (value = "") => String(value).split("\n").filter((line) => !/^>/.test(line.trim())).join(" ").replace(/\s+/g, " ").trim().slice(0, 360) || String(value).replace(/>+/g, "").replace(/\s+/g, " ").trim().slice(0, 360);

export default function TopicPage() {
  const { session, isAdmin } = useAuth();
  const userId = session?.user?.id || null;
  const { id } = useParams();
  const [topic, setTopic] = useState(null);
  const [category, setCategory] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editBody, setEditBody] = useState("");
  const [quoteTarget, setQuoteTarget] = useState(null);
  const [replyError, setReplyError] = useState("");

  const loadPosts = async () => {
    const { data } = await supabase.from("forum_posts").select("id,author,author_name,body,created_at").eq("topic_id", id).is("deleted_at", null).order("created_at");
    setPosts(data || []);
  };
  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("forum_topics").select("id,category_id,title,author_name,pinned,locked,created_at").eq("id", id).maybeSingle();
      setTopic(t || null);
      if (t) {
        const [{ data: cat }] = await Promise.all([supabase.from("forum_categories").select("name,slug").eq("id", t.category_id).maybeSingle(), loadPosts()]);
        setCategory(cat || null);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const reply = async () => {
    if (!userId || !body.trim() || topic?.locked) return;
    setBusy(true); setReplyError("");
    const { data: prof } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
    const quote = quoteTarget ? `> @${quoteTarget.author_name || "Membre"} · message #${quoteTarget.number}\n> ${replyExcerpt(quoteTarget.body)}\n\n` : "";
    const { error } = await supabase.from("forum_posts").insert({ topic_id: id, author: userId, body: `${quote}${body.trim()}`, author_name: prof?.username || "Membre" });
    if (!error) { setBody(""); setQuoteTarget(null); await loadPosts(); }
    else setReplyError(error.message || "La réponse n’a pas pu être publiée.");
    setBusy(false);
  };
  const cite = (p, number) => {
    setQuoteTarget({ ...p, number });
    setTimeout(() => { document.getElementById("forum-reply")?.scrollIntoView({ behavior: "smooth", block: "center" }); document.getElementById("forum-reply-body")?.focus(); }, 50);
  };
  const toggleTopic = async (patch) => { await supabase.from("forum_topics").update(patch).eq("id", id); setTopic((t) => ({ ...t, ...patch })); };
  const saveEdit = async (postId) => {
    if (!editBody.trim()) return;
    await supabase.from("forum_posts").update({ body: editBody.trim() }).eq("id", postId);
    setEditId(null); setEditBody(""); await loadPosts();
  };
  const removePost = async (postId) => {
    if (!confirm("Supprimer ce message ?")) return;
    await supabase.from("forum_posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId);
    await loadPosts();
  };
  const reportPost = async (postId) => {
    const reason = prompt("Signaler ce message — motif (optionnel) :");
    if (reason === null) return;
    const { error } = await supabase.from("reports").insert({ target_type: "forum_post", target_id: postId, reporter: userId, reason: reason || null });
    alert(error ? "Impossible de signaler pour le moment." : "Merci, le message a été signalé aux modérateurs.");
  };

  if (loading) return <div className="mx-auto max-w-3xl py-10 text-center text-muted">Chargement…</div>;
  if (!topic) return <div className="mx-auto max-w-3xl py-10 text-center text-muted">Sujet introuvable. <Link href="/forum" className="text-accent">Retour au Noyau</Link></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <nav className="flex min-w-0 items-center gap-1.5 text-sm text-muted"><Link href="/forum" className="inline-flex shrink-0 items-center gap-1 hover:text-content"><ArrowLeft className="h-4 w-4" />Le Noyau</Link>{category && <><ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600" /><Link href={`/forum/c/${category.slug}`} className="truncate hover:text-content">{category.name}</Link></>}</nav>
      <div className="rounded-2xl border border-line/10 bg-gradient-to-r from-surface to-surface2/50 p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2">
        {topic.pinned && <Pin className="h-4 w-4 text-amber-300" />}
        {topic.locked && <Lock className="h-4 w-4 text-muted" />}
        <h1 className="text-2xl font-black">{topic.title}</h1>
        {isAdmin && <div className="ml-auto flex flex-shrink-0 gap-3 text-xs font-bold">
          <button onClick={() => toggleTopic({ pinned: !topic.pinned })} className={topic.pinned ? "text-amber-300" : "text-muted hover:text-content"}>{topic.pinned ? "Désépingler" : "Épingler"}</button>
          <button onClick={() => toggleTopic({ locked: !topic.locked })} className={topic.locked ? "text-red-300" : "text-muted hover:text-content"}>{topic.locked ? "Déverrouiller" : "Verrouiller"}</button>
        </div>}
      </div><div className="mt-2 flex items-center gap-3 text-xs text-muted"><span>Ouvert par <b className="text-content">{topic.author_name || "Membre"}</b></span><span>·</span><span>{posts.length} message{posts.length > 1 ? "s" : ""}</span></div></div>

      <div className="space-y-4">
        {posts.map((p, index) => {
          const mine = userId && p.author === userId;
          const number = index + 1;
          const initials = (p.author_name || "Membre").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
          return (
            <article id={`message-${number}`} key={p.id} className="scroll-mt-24 overflow-hidden rounded-2xl border border-line/10 bg-surface shadow-[0_18px_45px_-38px_rgba(0,0,0,.9)] sm:grid sm:grid-cols-[155px_minmax(0,1fr)]">
              <aside className="flex items-center gap-3 border-b border-line/10 bg-white/[0.018] px-4 py-3 sm:flex-col sm:items-start sm:border-b-0 sm:border-r sm:px-4 sm:py-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-sm font-black text-accent sm:h-14 sm:w-14 sm:text-base">{initials}</div>
                <div className="min-w-0"><div className="truncate text-sm font-black text-content">{p.author_name || "Membre"}</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Membre du Noyau</div>{mine && isAdmin && <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-red-300"><Shield className="h-3 w-3" />Équipe Belfoot</div>}</div>
              </aside>
              <div className="min-w-0">
              <header className="flex items-center justify-between gap-3 border-b border-line/10 bg-bg/20 px-4 py-2 text-[11px] text-muted sm:px-5"><time>{new Date(p.created_at).toLocaleString("fr-BE", { dateStyle: "medium", timeStyle: "short" })}</time><a href={`#message-${number}`} className="font-black text-slate-500 hover:text-accent">#{number}</a></header>
              <div className="px-4 py-4 sm:min-h-28 sm:px-5 sm:py-5">
              {editId === p.id ? (
                <div>
                  <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows="3" className="w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm" />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => saveEdit(p.id)} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white">Enregistrer</button>
                    <button onClick={() => { setEditId(null); setEditBody(""); }} className="text-xs text-muted">Annuler</button>
                  </div>
                </div>
              ) : (
                <>
                  <ForumPostBody body={p.body} />
                  {userId && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line/10 pt-3 text-[11px] text-muted">
                      <button onClick={() => cite(p, number)} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/20 bg-sky-400/[0.06] px-2.5 py-1.5 font-bold text-sky-200 transition hover:border-sky-300/50"><Quote className="h-3.5 w-3.5" />Répondre en citant</button>
                      {(mine || isAdmin) && <button onClick={() => { setEditId(p.id); setEditBody(p.body); }} className="inline-flex items-center gap-1 hover:text-content"><Pencil className="h-3.5 w-3.5" />Modifier</button>}
                      {(mine || isAdmin) && <button onClick={() => removePost(p.id)} className="inline-flex items-center gap-1 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" />Supprimer</button>}
                      {!mine && <button onClick={() => reportPost(p.id)} className="ml-auto inline-flex items-center gap-1 hover:text-amber-300"><Flag className="h-3.5 w-3.5" />Signaler</button>}
                    </div>
                  }
                </>
              )}
              </div></div>
            </article>
          );
        })}
      </div>

      {topic.locked ? (
        <p className="rounded-xl border border-line/15 bg-surface p-3 text-sm text-muted"><Lock className="mr-2 inline h-4 w-4" />Ce sujet est verrouillé.</p>
      ) : userId ? (
        <div id="forum-reply" className="rounded-2xl border border-line/15 bg-surface p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-black"><MessageSquareReply className="h-4 w-4 text-accent" />Répondre au sujet</div>
          {quoteTarget && <div className="mb-3 flex items-start gap-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.07] p-3 text-xs text-slate-300"><Quote className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" /><div className="min-w-0 flex-1"><b className="text-sky-200">Citation de {quoteTarget.author_name || "Membre"} · #{quoteTarget.number}</b><p className="mt-1 line-clamp-2 leading-5">{quoteTarget.body}</p></div><button onClick={() => setQuoteTarget(null)} className="shrink-0 text-muted hover:text-content">Retirer</button></div>}
          {replyError && <p className="mb-2 rounded-lg border border-red-400/20 bg-red-500/10 p-2 text-xs text-red-300">{replyError}</p>}
          <textarea id="forum-reply-body" value={body} maxLength={9500} onChange={(e) => setBody(e.target.value)} rows="5" placeholder={quoteTarget ? "Ta réponse à cette citation…" : "Écris ta réponse…"} className="w-full rounded-xl border border-line/10 bg-surface2 px-3 py-3 text-sm leading-6 outline-none transition focus:border-accent/50" />
          <div className="mt-2 flex items-center justify-between gap-3"><span className="text-[10px] text-muted">{body.length}/9 500 caractères</span><button onClick={reply} disabled={busy || !body.trim()} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{busy ? "Envoi…" : "Publier la réponse"}</button></div>
        </div>
      ) : (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-sm text-amber-200">Connecte-toi pour répondre.</p>
      )}
    </div>
  );
}
