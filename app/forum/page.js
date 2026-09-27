"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, Globe2, Landmark, MessagesSquare, Shield, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const rel = (d) => {
  if (!d) return "";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 604800) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(d).toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
};

export default function NoyauHome() {
  const [categories, setCategories] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: cats }, { data: tops }] = await Promise.all([
        supabase.from("forum_categories").select("id,name,slug,description,position").order("position"),
        supabase.from("forum_topics").select("id,category_id,title,author_name,pinned,locked,last_activity,created_at").order("last_activity", { ascending: false }).limit(100),
      ]);
      setCategories(cats || []);
      setTopics(tops || []);
      setLoading(false);
    })();
  }, []);

  const byCat = useMemo(() => {
    const m = {};
    for (const t of topics) (m[t.category_id] = m[t.category_id] || []).push(t);
    return m;
  }, [topics]);

  if (loading) return <div className="mx-auto max-w-3xl py-10 text-center text-muted">Chargement…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-accent/20 bg-[radial-gradient(circle_at_top_right,rgba(227,6,19,.18),transparent_42%),linear-gradient(145deg,rgba(17,32,55,.98),rgba(7,18,33,.98))] p-6 sm:p-8">
        <div className="absolute -right-8 -top-10 text-[9rem] font-black text-white/[0.025]">BN</div>
        <div className="flex items-center gap-3">
          <MessagesSquare className="h-8 w-8 text-accent" />
          <h1 className="text-3xl font-black">Le Noyau</h1>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted sm:text-base">L'espace communautaire de Belfoot : débats, réactions de match, mercato et suivi des Belges, avec des discussions directement reliées aux pages du site.</p>
        <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold"><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{categories.length} espaces</span><span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">{topics.length} discussions</span><span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5 text-emerald-300">Lecture publique · participation membre</span></div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-sm font-black uppercase tracking-[.14em]">Les espaces du Noyau</h2><span className="text-[10px] text-muted">Choisis ta tribune</span></div>
        {categories.map((cat) => {
          const list = byCat[cat.id] || [];
          const last = list[0];
          const Icon = cat.slug === "football-belge" ? Landmark : cat.slug === "diables-selections" ? Shield : cat.slug === "belges-etranger" ? Globe2 : Trophy;
          return (
            <Link key={cat.id} href={`/forum/c/${cat.slug}`} className="group block rounded-2xl border border-line/10 bg-gradient-to-r from-surface to-bg/40 p-4 transition hover:border-accent/40 hover:bg-surface2/70">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/15 bg-accent/[0.07] text-accent"><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-black"><span>{cat.name}</span><ArrowRight className="h-3.5 w-3.5 text-muted transition group-hover:translate-x-1 group-hover:text-accent" /></div>
                  {cat.description && <div className="mt-0.5 text-sm text-muted">{cat.description}</div>}
                </div>
                <div className="flex-shrink-0 text-right text-xs text-muted">{list.length} sujet{list.length > 1 ? "s" : ""}</div>
              </div>
              {last ? (
                <div className="mt-3 truncate border-t border-line/10 pt-2 text-[12px] text-muted">
                  Dernier : <span className="font-semibold text-content">{last.title}</span> · {last.author_name || "Membre"} · {rel(last.last_activity || last.created_at)}
                </div>
              ) : (
                <div className="mt-3 border-t border-line/10 pt-2 text-[12px] text-muted">Aucun sujet — lance le premier !</div>
              )}
            </Link>
          );
        })}
        {categories.length === 0 && <p className="rounded-2xl border border-dashed border-line/15 p-6 text-center text-sm text-muted">Le Noyau ouvre bientôt ses portes. (Applique la migration forum/0002 pour semer les catégories.)</p>}
      </div>
      <aside className="overflow-hidden rounded-2xl border border-line/10 bg-surface"><div className="flex items-center gap-2 border-b border-line/10 px-4 py-3"><Clock3 className="h-4 w-4 text-amber-300" /><h2 className="text-sm font-black">Discussions actives</h2></div><div className="divide-y divide-line/10">{topics.slice(0, 6).map((topic) => <Link key={topic.id} href={`/forum/${topic.id}`} className="block px-4 py-3 transition hover:bg-white/[0.025]"><div className="line-clamp-2 text-sm font-bold leading-5">{topic.title}</div><div className="mt-1 text-[10px] text-muted">{topic.author_name || "Membre"} · {rel(topic.last_activity || topic.created_at)}</div></Link>)}{topics.length === 0 && <p className="p-4 text-xs text-muted">Les discussions récentes apparaîtront ici.</p>}</div><div className="border-t border-line/10 bg-bg/20 px-4 py-3 text-[10px] leading-4 text-muted">Le bon réflexe : argumenter, sourcer une information et signaler sans alimenter les débordements.</div></aside>
      </div>
    </div>
  );
}
