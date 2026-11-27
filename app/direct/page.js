"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import LiveMatchCenter from "@/components/football/LiveMatchCenter";
import { supabase } from "@/lib/supabaseClient";

export default function DirectPage() {
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    supabase.from("competitions").select("*").order("position", { ascending: true, nullsFirst: false }).then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError(loadError.message || String(loadError));
      else setCompetitions((data || []).filter((competition) => competition.public_visible !== false));
      setLoading(false);
    }).catch((loadError) => { if (active) { setError(loadError.message || String(loadError)); setLoading(false); } });
    return () => { active = false; };
  }, []);
  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-red-400">Belfoot en direct</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">Scores en direct</h1><p className="mt-1 text-sm text-muted">Les matchs du jour en direct, les résultats des 5 derniers jours et le programme de la semaine.</p></div>
        <Link href="/matchs" className="inline-flex w-fit items-center gap-2 rounded-xl border border-line/15 bg-surface px-3 py-2 text-xs font-bold hover:border-accent/40"><CalendarDays size={15} />Voir le calendrier<ArrowRight size={14} /></Link>
      </div>
      {loading ? <div role="status" aria-label="Chargement du direct" className="h-40 animate-pulse rounded-2xl bg-surface" /> : error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Impossible de charger le direct : {error}</p> : <LiveMatchCenter competitions={competitions} />}
    </div>
  );
}
