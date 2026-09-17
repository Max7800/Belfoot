"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getCompetitionType } from "@/lib/competitionType";

export default function CompetitionsPage() {
  const [comps, setComps] = useState([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { (async () => {
    const [competitionsResult, matchesResult] = await Promise.all([
      supabase.from("competitions").select("*").order("name"),
      supabase.from("matches").select("competition_id,phase,round_raw"),
    ]);
    if (competitionsResult.error) throw competitionsResult.error;
    const byCompetition = {};
    for (const match of matchesResult.data || []) (byCompetition[match.competition_id] ||= []).push(match);
    const rows = (competitionsResult.data || []).map((competition) => ({
      ...competition,
      display_type: getCompetitionType(competition, byCompetition[competition.id] || []),
    })).sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (a.name || "").localeCompare(b.name || ""));
    setComps(rows); setLoading(false);
  })().catch((e) => { setError(e.message || String(e)); setLoading(false); }); }, []);
  return (
    <div>
      <h1 className="mb-6 text-3xl font-black">Compétitions</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {comps.map((c) => (
          <Link key={c.id} href={`/competitions/${c.slug || c.id}`} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-4 transition hover:border-accent/40">
            {c.logo_url && <img src={c.logo_url} className="h-10 w-10 object-contain" alt="" />}
            <span className="min-w-0 flex-1"><span className="block truncate font-bold">{c.name}</span><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{c.display_type === "cup" ? "Coupe" : "Championnat"}</span></span>
          </Link>
        ))}
        {loading && <p className="text-muted">Chargement…</p>}
        {!loading && error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Impossible de charger les compétitions : {error}</p>}
        {!loading && !error && comps.length === 0 && <p className="text-muted">Aucune compétition pour l'instant.</p>}
      </div>
    </div>
  );
}
