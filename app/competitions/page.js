"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function CompetitionsPage() {
  const [comps, setComps] = useState([]);
  useEffect(() => { supabase.from("competitions").select("*").order("name").then(({ data }) => setComps((data || []).sort((a, b) => (a.position ?? 999) - (b.position ?? 999)))).catch(() => {}); }, []);
  return (
    <div>
      <h1 className="mb-6 text-3xl font-black">Compétitions</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {comps.map((c) => (
          <Link key={c.id} href={`/competitions/${c.slug || c.id}`} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-4 transition hover:border-accent/40">
            {c.logo_url && <img src={c.logo_url} className="h-10 w-10 object-contain" alt="" />}
            <span className="font-bold">{c.name}</span>
          </Link>
        ))}
        {comps.length === 0 && <p className="text-muted">Aucune compétition pour l'instant.</p>}
      </div>
    </div>
  );
}
