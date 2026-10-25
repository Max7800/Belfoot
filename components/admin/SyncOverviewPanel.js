"use client";
// Vue d'ensemble des synchronisations — LECTURE SEULE : aucune écriture, aucun
// job lancé. Les actions restent dans leurs panneaux (Jobs, Plan d'import) et
// sur les fiches (compétition, club, joueur).
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { buildSyncOverview, loadSyncOverviewData } from "@/lib/syncOverview";

const STATUS = {
  ok: ["À jour", "text-emerald-300"],
  late: ["En retard", "text-amber-300"],
  "not-allowed": ["Non autorisée", "text-amber-200"],
  "no-season": ["Aucune saison publiée", "text-muted"],
};
const ALERT_STYLE = { warning: "border-amber-400/25 bg-amber-400/10 text-amber-100", action: "border-sky-400/25 bg-sky-400/10 text-sky-100", info: "border-line/15 bg-surface/50 text-muted" };
const when = (value) => (value ? new Date(value).toLocaleString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const age = (hours) => (hours === null || hours === undefined ? "jamais" : hours < 1 ? "< 1 h" : `${Math.round(hours)} h`);

export default function SyncOverviewPanel() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await loadSyncOverviewData(supabase);
      setOverview(await buildSyncOverview({ ...data, now: Date.now() }));
      setLoadedAt(new Date().toISOString());
    } catch (loadError) {
      setError(loadError.message || String(loadError));
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Synchronisation</p><h1 className="mt-1 text-2xl font-black">Vue d’ensemble</h1><p className="mt-1 max-w-3xl text-sm text-muted">Lecture seule : état des rafraîchissements automatiques, des sélections suivies et des jobs des dernières 24 heures. Aucune action n’est lancée depuis cette page.</p></div>
      <button type="button" onClick={load} disabled={loading} className="rounded-xl border border-line/15 bg-surface p-2 text-muted hover:text-white disabled:opacity-50" title="Relire les données"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
    </div>
    {error && <p className="rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">Lecture impossible : {error}</p>}
    {loading && !overview && <div className="h-40 animate-pulse rounded-2xl bg-surface" />}
    {overview && <>
      <section className="space-y-2">
        <h2 className="text-sm font-black uppercase tracking-wider text-muted">Alertes</h2>
        {overview.alerts.length ? overview.alerts.map((alert, index) => <p key={index} className={`rounded-xl border px-3 py-2 text-sm ${ALERT_STYLE[alert.level]}`}>{alert.text}</p>) : <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">Aucune alerte.</p>}
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        {[["Jobs (24 h)", overview.jobs.total], ["Appels API (24 h)", overview.jobs.calls], ["Erreurs / coupures", (overview.jobs.byStatus.error || 0) + (overview.jobs.byStatus.timeout || 0)], ["Quota restant", overview.jobs.latestQuota ?? "—"]].map(([label, value]) => <div key={label} className="rounded-2xl border border-line/10 bg-surface p-4"><b className="block text-2xl">{value}</b><span className="text-[11px] text-muted">{label}</span></div>)}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-muted">Compétitions visibles</h2>
        <div className="overflow-x-auto rounded-2xl border border-line/10"><table className="w-full min-w-[720px] text-sm"><thead className="bg-surface2 text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="p-3">Compétition</th><th className="p-3">Saison</th><th className="p-3">Dernier rafraîchissement</th><th className="p-3">État</th><th className="p-3">Statistiques</th><th className="p-3">Renouvellement</th><th className="p-3">À activer</th></tr></thead><tbody>
          {overview.competitions.map((row) => <tr key={row.id} className="border-t border-line/10"><td className="p-3 font-semibold">{row.name}</td><td className="p-3">{row.season || "—"}</td><td className="p-3">{when(row.lastRefresh)} <span className="text-muted">({age(row.ageHours)})</span></td><td className={`p-3 font-bold ${STATUS[row.status]?.[1] || ""}`}>{STATUS[row.status]?.[0] || row.status}</td><td className="p-3 text-xs text-muted">{row.stats ? (row.stats.clubIndex ? `en cours (club ${row.stats.clubIndex})` : when(row.stats.lastStatsAt)) : "—"}</td><td className="p-3 text-xs text-muted">{row.rollover ? `${when(row.rollover.checkedAt)} · ${row.rollover.ok ? (row.rollover.detail || "ok") : `échec : ${row.rollover.error || ""}`}` : "pas encore vérifiée"}</td><td className="p-3 text-xs">{row.readySeasons.join(", ") || "—"}</td></tr>)}
        </tbody></table></div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-muted">Sélections suivies</h2>
        <div className="overflow-x-auto rounded-2xl border border-line/10"><table className="w-full min-w-[520px] text-sm"><thead className="bg-surface2 text-left text-[11px] uppercase tracking-wider text-muted"><tr><th className="p-3">Sélection</th><th className="p-3">Catégorie</th><th className="p-3">Dernière synchro</th><th className="p-3">État</th></tr></thead><tbody>
          {overview.nationalTeams.map((row) => <tr key={row.id} className="border-t border-line/10"><td className="p-3 font-semibold">{row.name}</td><td className="p-3">{row.category || "—"} · {row.gender === "women" ? "femmes" : "hommes"}</td><td className="p-3">{when(row.lastSync)} <span className="text-muted">({age(row.ageHours)})</span></td><td className={`p-3 font-bold ${STATUS[row.status]?.[1] || ""}`}>{STATUS[row.status]?.[0] || row.status}</td></tr>)}
        </tbody></table></div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-muted">Dernières erreurs et coupures (24 h)</h2>
        {overview.jobs.failures.length ? <div className="space-y-2">{overview.jobs.failures.map((run) => <div key={run.id} className="rounded-xl border border-line/10 bg-surface/60 p-3 text-xs"><div className="flex flex-wrap gap-2"><b>{run.job_key}</b><span className="text-muted">{run.target_key}</span><span className={run.status === "timeout" ? "text-amber-300" : "text-red-300"}>{run.status}</span><span className="text-muted">{when(run.started_at)}</span></div><p className="mt-1 text-muted">{run.detail || "—"}</p></div>)}</div> : <p className="text-sm text-muted">Aucune.</p>}
      </section>
      {loadedAt && <p className="text-[11px] text-muted">Données lues le {when(loadedAt)}.</p>}
    </>}
  </div>;
}
