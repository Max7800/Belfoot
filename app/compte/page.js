"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";

export default function ComptePage() {
  const { session, role, loading } = useAuth();
  const userId = session?.user?.id || null;
  const [username, setUsername] = useState("");
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!userId) return;
    supabase.from("profiles").select("username").eq("id", userId).maybeSingle().then(({ data }) => setUsername(data?.username || ""));
    (async () => {
      const [posts, topics, votes, contribs] = await Promise.all([
        supabase.from("forum_posts").select("id", { count: "exact", head: true }).eq("author", userId),
        supabase.from("forum_topics").select("id", { count: "exact", head: true }).eq("author", userId),
        supabase.from("votw_votes").select("session_id").eq("member_id", userId),
        supabase.from("contributions").select("id", { count: "exact", head: true }).eq("submitted_by", userId),
      ]);
      const votw = new Set((votes.data || []).map((v) => v.session_id)).size;
      setStats({ posts: posts.count || 0, topics: topics.count || 0, votw, contribs: contribs.count || 0 });
    })().catch(() => {});
  }, [userId]);

  if (loading) return <p className="text-muted">…</p>;
  if (!session) return <p className="text-muted">Connecte-toi pour voir ton compte.</p>;
  const save = async () => { await supabase.from("profiles").update({ username }).eq("id", userId); setSaved(true); setTimeout(() => setSaved(false), 1500); };

  const badges = [];
  if (role === "admin") badges.push({ label: "Équipe Belfoot", color: "#dc2626" });
  if (stats) {
    if (stats.contribs >= 1) badges.push({ label: "Contributeur", color: "#0ea5e9" });
    if (stats.posts + stats.topics >= 10) badges.push({ label: "Pilier du Noyau", color: "#8b5cf6" });
    else if (stats.posts + stats.topics >= 1) badges.push({ label: "Membre actif", color: "#22c55e" });
    if (stats.votw >= 3) badges.push({ label: "Sélectionneur", color: "#f59e0b" });
  }
  if (!badges.length) badges.push({ label: "Membre", color: "#64748b" });

  const Stat = ({ n, label, href }) => {
    const inner = <div className="rounded-2xl border border-line/10 bg-surface p-4 text-center"><div className="text-2xl font-black">{n}</div><div className="text-[11px] uppercase tracking-wider text-muted">{label}</div></div>;
    return href ? <Link href={href} className="transition hover:opacity-80">{inner}</Link> : inner;
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-black">Mon compte</h1>
        <div className="text-sm text-muted">{session.user.email} · rôle : {role}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {badges.map((b) => <span key={b.label} style={{ color: b.color, borderColor: `${b.color}55`, backgroundColor: `${b.color}1a` }} className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-black">{b.label}</span>)}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Mon activité</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat n={stats ? stats.topics : "…"} label="Sujets" href="/forum" />
          <Stat n={stats ? stats.posts : "…"} label="Messages" href="/forum" />
          <Stat n={stats ? stats.votw : "…"} label="Votes 11" href="/onze" />
          <Stat n={stats ? stats.contribs : "…"} label="Propositions" href="/proposer" />
        </div>
      </div>

      <div className="rounded-2xl border border-line/10 bg-surface p-4">
        <label className="mb-1 block text-xs uppercase tracking-wider text-muted">Pseudo</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded border border-line/10 bg-surface2 px-3 py-2 outline-none focus:border-accent" />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={save} className="rounded bg-accent px-4 py-2 text-sm font-bold text-white">Enregistrer</button>
          {saved && <span className="text-xs text-green-400">✓</span>}
          <button onClick={() => supabase.auth.signOut()} className="ml-auto text-sm text-muted hover:text-content">Se déconnecter</button>
        </div>
      </div>
    </div>
  );
}
