"use client";

import { useEffect, useMemo, useState } from "react";
import { Radio, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const DEFAULT_STRATEGY = {
  idle_seconds: 300,
  matchday_seconds: 60,
  live_seconds: 30,
  post_match_seconds: 120,
  window_before_minutes: 15,
  window_after_minutes: 180,
  max_concurrent_matches: 8,
  reserved_daily_calls: 300,
};

export default function LiveStrategyPanel() {
  const [competitions, setCompetitions] = useState([]);
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [windowPlan, setWindowPlan] = useState({ matches: 0, competitions: 0, calls: 0 });

  useEffect(() => { (async () => {
    const [competitionResult, settingsResult] = await Promise.all([
      supabase.from("competitions").select("id,name,provider,live_enabled,live_refresh_seconds").order("name"),
      supabase.from("site_settings").select("data").eq("id", 1).maybeSingle(),
    ]);
    setCompetitions(competitionResult.data || []);
    setStrategy({ ...DEFAULT_STRATEGY, ...(settingsResult.data?.data?.football_live_strategy || {}) });
  })(); }, []);

  const enabled = competitions.filter((competition) => competition.live_enabled && competition.provider);
  const enabledIds = enabled.map((competition) => competition.id).join(",");
  const callsPerCycle = enabled.length + Number(strategy.max_concurrent_matches || 0);
  const liveCyclesPerHour = Math.ceil(3600 / Math.max(30, Number(strategy.live_seconds) || 30));
  const liveHourlyMax = callsPerCycle * liveCyclesPerHour;
  const fields = useMemo(() => [
    ["idle_seconds", "Sans match proche", 60, 900],
    ["matchday_seconds", "Jour de match, avant coup d’envoi", 30, 300],
    ["live_seconds", "Pendant le direct", 30, 120],
    ["post_match_seconds", "Après le coup de sifflet", 60, 300],
    ["window_before_minutes", "Ouvrir la fenêtre avant le match (min)", 5, 120],
    ["window_after_minutes", "Fermer la fenêtre après le coup d’envoi (min)", 90, 300],
    ["max_concurrent_matches", "Matchs simultanés maximum", 1, 20],
    ["reserved_daily_calls", "Budget quotidien réservé", 1, 10000],
  ], []);
  useEffect(() => {
    const ids = enabledIds.split(",").filter(Boolean);
    if (!ids.length) { setWindowPlan({ matches: 0, competitions: 0, calls: 0 }); return; }
    const max = Math.max(1, Math.min(20, Number(strategy.max_concurrent_matches) || 8));
    const now = Date.now();
    const from = new Date(now - (Number(strategy.window_after_minutes) || 180) * 60000).toISOString();
    const to = new Date(now + (Number(strategy.window_before_minutes) || 15) * 60000).toISOString();
    supabase.from("matches").select("id,competition_id").in("competition_id", ids).in("status", ["scheduled", "live"]).gte("kickoff", from).lte("kickoff", to).order("kickoff", { ascending: true }).limit(max).then(({ data }) => {
      const rows = data || [];
      const competitionCount = new Set(rows.map((match) => match.competition_id)).size;
      setWindowPlan({ matches: rows.length, competitions: competitionCount, calls: rows.length + competitionCount });
    });
  }, [enabledIds, strategy.max_concurrent_matches, strategy.window_after_minutes, strategy.window_before_minutes]);
  const save = async () => {
    setSaving(true); setMessage("");
    const { data } = await supabase.from("site_settings").select("data").eq("id", 1).maybeSingle();
    const { error } = await supabase.from("site_settings").update({ data: { ...(data?.data || {}), football_live_strategy: strategy } }).eq("id", 1);
    setMessage(error?.message || "Stratégie enregistrée. Elle documente les limites ; le cron devra être activé séparément sur Vercel.");
    setSaving(false);
  };

  return <div>
    <p className="text-xs font-black uppercase tracking-[.18em] text-red-300">Match Center</p>
    <h1 className="mt-1 text-2xl font-black">Stratégie du direct</h1>
    <p className="mt-2 max-w-3xl text-sm text-muted">Planifie la fréquence et réserve un budget avant d’activer le cron. Cette page n’appelle jamais API-Football et n’active rien automatiquement.</p>
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-line/10 bg-surface p-4"><h2 className="mb-3 text-sm font-black">Fréquences prévues</h2><div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label, min, max]) => <label key={key} className="text-xs text-muted">{label}<input type="number" min={min} max={max} value={strategy[key]} onChange={(event) => setStrategy((current) => ({ ...current, [key]: Math.max(min, Math.min(max, Number(event.target.value) || min)) }))} className="mt-1 block w-full rounded-lg border border-line/10 bg-surface2 px-3 py-2 text-sm text-content" /></label>)}</div><button type="button" onClick={save} disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save size={15} />Enregistrer</button>{message && <p className="mt-3 text-xs text-muted">{message}</p>}</section>
      <section className="rounded-2xl border border-red-400/20 bg-red-500/5 p-4"><h2 className="flex items-center gap-2 text-sm font-black text-red-200"><Radio size={16} />Coût maximal lisible</h2><div className="mt-4 grid grid-cols-3 gap-3"><div className="rounded-xl bg-black/15 p-3"><b className="text-2xl">{windowPlan.calls}</b><span className="block text-[10px] text-muted">prochain cycle estimé</span></div><div className="rounded-xl bg-black/15 p-3"><b className="text-2xl">{callsPerCycle}</b><span className="block text-[10px] text-muted">plafond / cycle</span></div><div className="rounded-xl bg-black/15 p-3"><b className="text-2xl">{liveHourlyMax}</b><span className="block text-[10px] text-muted">plafond / heure</span></div></div><p className="mt-3 text-xs leading-5 text-muted">Fenêtre actuelle : {windowPlan.matches} match{windowPlan.matches > 1 ? "s" : ""} dans {windowPlan.competitions} compétition{windowPlan.competitions > 1 ? "s" : ""}. Estimation : une requête de scores par compétition, puis une requête d’événements par match suivi.</p><p className="mt-2 rounded-lg border border-emerald-400/15 bg-emerald-400/5 px-3 py-2 text-[11px] leading-5 text-emerald-100">Le dispatcher protégé est prêt : hors de la fenêtre de {strategy.window_before_minutes || 15} min avant à {strategy.window_after_minutes || 180} min après le coup d’envoi, il s’arrête sans appel API. Le cron Vercel reste à activer séparément.</p><div className="mt-3 space-y-1">{enabled.map((competition) => <div key={competition.id} className="flex justify-between rounded-lg border border-line/10 px-3 py-2 text-xs"><b>{competition.name}</b><span className="text-muted">{competition.live_refresh_seconds || strategy.live_seconds}s conseillé</span></div>)}{!enabled.length && <p className="text-xs text-amber-200">Aucune compétition n’a « Direct activé ».</p>}</div></section>
    </div>
  </div>;
}
