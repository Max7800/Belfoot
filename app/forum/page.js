"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
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
        supabase.from("forum_topics").select("id,category_id,title,author_name,last_activity,created_at").order("last_activity", { ascending: false }),
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-3xl border border-accent/20 bg-gradient-to-b from-accent/10 to-transparent p-6">
        <div className="flex items-center gap-3">
          <MessagesSquare className="h-8 w-8 text-accent" />
          <h1 className="text-3xl font-black">Le Noyau</h1>
        </div>
        <p className="mt-2 text-muted">L'espace communautaire de Belfoot : on débat foot belge — Diables, Pro League, mercato, Belges à l'étranger — autour des matchs, clubs, joueurs et articles du site.</p>
      </div>

      <div className="space-y-3">
        {categories.map((cat) => {
          const list = byCat[cat.id] || [];
          const last = list[0];
          return (
            <Link key={cat.id} href={`/forum/c/${cat.slug}`} className="block rounded-2xl border border-line/10 bg-surface p-4 transition hover:border-accent/40">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-black">{cat.name}</div>
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
    </div>
  );
}
