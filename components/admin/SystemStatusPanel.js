"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Database, RefreshCw, ServerCog, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function StatusIcon({ ok }) {
  return ok ? <CheckCircle2 size={16} className="shrink-0 text-emerald-400" /> : <XCircle size={16} className="shrink-0 text-red-400" />;
}

function StatusList({ rows, empty = "Aucun contrôle disponible." }) {
  return <div className="divide-y divide-line/10 overflow-hidden rounded-xl border border-line/10 bg-surface">{rows.map((row) => <div key={row.label || `${row.module}-${row.version}`} className="flex items-start gap-3 p-3 text-sm"><StatusIcon ok={row.ok ?? row.applied} /><div className="min-w-0 flex-1"><b className="block text-xs font-semibold">{row.label || `${row.module} · ${row.version}`}</b>{row.detail && <span className="mt-0.5 block break-words text-[11px] text-muted">{row.detail}</span>}{row.applied_at && <span className="mt-0.5 block text-[10px] text-muted">Appliquée le {new Date(row.applied_at).toLocaleString("fr-BE")}</span>}</div>{row.required === false && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] uppercase text-muted">optionnel</span>}</div>)}{!rows.length && <div className="p-4 text-sm text-muted">{empty}</div>}</div>;
}

export default function SystemStatusPanel() {
  const [state, setState] = useState({ loading: true, error: "", report: null });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/admin/system-status", { headers: { Authorization: `Bearer ${session?.access_token || ""}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setState({ loading: false, error: "", report: payload });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || String(error) }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const report = state.report;
  const requiredEnvironmentOk = report?.environment?.filter((item) => item.required).every((item) => item.ok);
  const schemaOk = report?.checks?.every((item) => item.ok);
  const migrationsOk = report?.migrations?.every((item) => item.applied);
  const ready = Boolean(requiredEnvironmentOk && schemaOk && migrationsOk);

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Fiabilité des données</p><h1 className="mt-1 text-2xl font-black">Préparation 2026</h1><p className="mt-1 max-w-2xl text-sm text-muted">Contrôle en lecture seule de la base et de la configuration. Cette page ne lance aucun job et ne consomme aucun appel API-Football.</p></div><button type="button" onClick={load} disabled={state.loading} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-line/15 bg-surface px-3 py-2 text-xs font-bold hover:border-accent/40 disabled:opacity-50"><RefreshCw size={14} className={state.loading ? "animate-spin" : ""} />Actualiser</button></div>

      {state.error && <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle size={18} className="shrink-0" /><div><b>Contrôle impossible</b><p className="mt-1 text-xs opacity-80">{state.error}</p></div></div>}
      {state.loading && !report && <div className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-5 text-sm text-muted"><CircleDashed size={18} className="animate-spin" />Analyse de la configuration…</div>}

      {report && <>
        <div className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 ${ready ? "border-emerald-400/25 bg-emerald-400/10" : "border-amber-400/25 bg-amber-400/10"}`}>{ready ? <CheckCircle2 size={22} className="shrink-0 text-emerald-300" /> : <AlertTriangle size={22} className="shrink-0 text-amber-300" />}<div><b className="block">{ready ? "Fondations techniques prêtes" : "Quelques points restent à vérifier"}</b><p className="mt-1 text-xs text-muted">La présence d'une saison 2026 et l'activation du direct restent volontaires : elles ne doivent être faites qu'après l'abonnement API-Football.</p></div></div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{[
          [report.data.competitions, "Compétitions"], [report.data.public_competitions, "Publiques"], [report.data.seasons, "Saisons"], [report.data.seasons_2026, "Saisons 2026"], [report.data.tracked_players, "Belges suivis"], [report.data.live_competitions, "Direct activé"],
        ].map(([value, label]) => <div key={label} className="rounded-xl border border-line/10 bg-surface p-3"><div className="text-xl font-black">{value}</div><div className="text-[10px] text-muted">{label}</div></div>)}</div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section><h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><ServerCog size={16} className="text-accent" />Configuration Vercel</h2><StatusList rows={report.environment} /></section>
          <section><h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><Database size={16} className="text-accent" />Capacités de la base</h2><StatusList rows={report.checks} /></section>
          <section className="xl:col-span-2"><h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><Database size={16} className="text-accent" />Migrations enregistrées</h2><p className="mb-2 text-xs text-muted">Les anciennes migrations n'étaient pas toutes enregistrées. Leurs fonctions sont donc contrôlées ci-dessus directement dans le schéma.</p><StatusList rows={report.migrations} /></section>
        </div>
        {report.errors?.length > 0 && <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs text-amber-200">{report.errors.join(" · ")}</div>}
        <p className="mt-4 text-right text-[10px] text-muted">Dernier contrôle : {new Date(report.generated_at).toLocaleString("fr-BE")}</p>
      </>}
    </div>
  );
}
