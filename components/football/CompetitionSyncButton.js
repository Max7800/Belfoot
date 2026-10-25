"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { confirmationText, launchJob } from "@/lib/adminJobs";

// Bouton admin DISCRET sur la page d'une compétition : synchronise cette compétition
// pour la saison AFFICHÉE (matchs + scores + couverture) sans passer par l'admin,
// avec préflight et confirmation comme les autres actions ciblées.
// Auto-masqué pour les non-admins. Le classement se recalcule au rechargement.
export default function CompetitionSyncButton({ competition, season }) {
  const { isAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!isAdmin || !competition?.id) return null;

  const sync = async () => {
    // Sans saison publiée (premier import), repli sur la saison de la fiche.
    const target = season || competition.ext?.season || null;
    if (!target) { setMsg("✗ saison inconnue"); return; }
    setBusy(true); setMsg("");
    try {
      const outcome = await launchJob({ key: "football.sync", competitionId: competition.id, season: target, requestLimit: 30 }, {
        confirm: (preflight) => window.confirm(confirmationText(`Synchroniser ${competition.name} pour ${preflight.season || target} ?`, preflight, "Matchs, scores et couverture de la saison.")),
      });
      setMsg(outcome.cancelled ? "" : "✓ recharge");
    } catch (e) { setMsg(`✗ ${String(e.message).slice(0, 80)}`); }
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
