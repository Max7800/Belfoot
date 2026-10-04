"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";

// Bouton admin DISCRET sur la page d'une compétition : synchronise cette compétition
// (import complet : matchs + scores + couverture) sans passer par l'admin.
// Auto-masqué pour les non-admins. Le classement se recalcule au rechargement.
export default function CompetitionSyncButton({ competition }) {
  const { isAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!isAdmin || !competition?.id) return null;

  const sync = async () => {
    setBusy(true); setMsg("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/admin/run-job", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ key: "football.sync", competitionId: competition.id, season: competition.ext?.season || null, requestLimit: 30 }),
      });
      const txt = await r.text();
      setMsg(r.ok ? "✓ recharge" : `✗ ${txt.slice(0, 60)}`);
    } catch (e) { setMsg(`✗ ${e.message}`); }
    setBusy(false);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button onClick={sync} disabled={busy} title="Synchroniser cette compétition (admin)" className="inline-flex items-center gap-1 rounded-lg border border-line/15 px-2 py-1 text-[11px] font-bold text-muted transition hover:border-accent/40 hover:text-content disabled:opacity-50">
        <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />{busy ? "Sync…" : "Sync"}
      </button>
      {msg && <span className="text-[11px] text-muted">{msg}</span>}
    </span>
  );
}
