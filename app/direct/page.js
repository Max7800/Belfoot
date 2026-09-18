"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import LiveMatchCenter from "@/components/football/LiveMatchCenter";
import { supabase } from "@/lib/supabaseClient";

export default function DirectPage() {
  const [competitions, setCompetitions] = useState([]);
  useEffect(() => {
    supabase.from("competitions").select("*").order("position", { ascending: true, nullsFirst: false }).then(({ data }) => setCompetitions((data || []).filter((competition) => competition.public_visible !== false)));
  }, []);
  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-red-400">Belfoot en direct</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">Match Center</h1><p className="mt-1 text-sm text-muted">Tous les scores et les événements, sans mélanger le direct avec le calendrier complet.</p></div>
        <Link href="/matchs" className="inline-flex w-fit items-center gap-2 rounded-xl border border-line/15 bg-surface px-3 py-2 text-xs font-bold hover:border-accent/40"><CalendarDays size={15} />Voir le calendrier<ArrowRight size={14} /></Link>
      </div>
      <LiveMatchCenter competitions={competitions} />
    </div>
  );
}
