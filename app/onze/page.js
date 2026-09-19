"use client";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// Coquille de la page « 11 de la semaine ». Le terrain de vote + le résultat
// arrivent au sous-lot 2/3 ; cette version reste tolérante si les tables votw
// ne sont pas encore migrées (aucune casse, simple état vide).
export default function OnzePage() {
  const [open, setOpen] = useState(null);
  const [published, setPublished] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("votw_sessions")
        .select("id,matchday,season_label,status,formation,closes_at,published_at")
        .order("created_at", { ascending: false }).limit(20);
      if (!error) {
        setOpen((data || []).find((s) => s.status === "open") || null);
        setPublished((data || []).filter((s) => s.status === "published"));
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Star className="h-7 w-7 text-amber-300" />
        <h1 className="text-3xl font-black">Le 11 de la semaine</h1>
      </div>
      <p className="text-muted">Compose ton équipe type de la journée : le terrain de vote arrive très bientôt.</p>

      {!loading && open && (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-5">
          <div className="text-xs font-black uppercase tracking-wider text-amber-300">Vote en cours</div>
          <div className="mt-1 font-bold">Journée {open.matchday}{open.season_label ? ` · ${open.season_label}` : ""} — {open.formation || "4-3-3"}</div>
          <p className="mt-1 text-sm text-muted">Le terrain de sélection sera disponible ici.</p>
        </div>
      )}

      {!loading && published.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-black">Onze déjà publiés</h2>
          <div className="space-y-2">
            {published.map((s) => (
              <div key={s.id} className="rounded-xl border border-line/10 bg-surface p-3 text-sm">
                Journée {s.matchday}{s.season_label ? ` · ${s.season_label}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !open && published.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line/15 p-6 text-center text-sm text-muted">Aucun vote ouvert pour l'instant. Reviens bientôt !</p>
      )}
    </div>
  );
}
