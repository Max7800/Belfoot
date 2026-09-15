import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
export const dynamic = "force-dynamic";

export default async function CompetitionsPage() {
  let comps = [];
  try { const { data } = await supabase.from("competitions").select("*").order("position", { ascending: true, nullsFirst: false }).order("name"); comps = data || []; } catch {}
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
