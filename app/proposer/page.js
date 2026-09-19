"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { normalizeProposeConfig } from "@/lib/propose";

// Point d'entrée public unique. Les tuiles = collections contribuables (auto),
// leur libellé/ordre/visibilité et les textes du bandeau sont administrables
// (Admin → Contenu → Page Proposer, site_settings.data.propose).
export default function ProposeHub() {
  const [cfg, setCfg] = useState(() => normalizeProposeConfig());
  useEffect(() => {
    supabase
      .from("site_settings")
      .select("data")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => setCfg(normalizeProposeConfig(data?.data?.propose)))
      .catch(() => {});
  }, []);
  const types = cfg.types.filter((t) => t.enabled);
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-wide text-accent">{cfg.hub.kicker}</p>
      <h1 className="mt-1 text-3xl font-black">{cfg.hub.title}</h1>
      {cfg.hub.intro && <p className="mt-2 text-muted">{cfg.hub.intro}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {types.map((t) => (
          <Link
            key={t.key}
            href={t.route}
            className="rounded-xl border border-line/10 bg-surface p-4 transition hover:border-accent/40"
          >
            <div className="font-bold">{t.label}</div>
            <div className="mt-1 text-sm text-muted">Proposer · passe en modération</div>
          </Link>
        ))}
        {types.length === 0 && (
          <p className="text-muted">Les propositions ne sont pas ouvertes pour le moment.</p>
        )}
      </div>
    </div>
  );
}
