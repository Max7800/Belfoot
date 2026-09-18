"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Radio, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useLabels } from "@/lib/labels";
import MatchLineups from "@/components/football/MatchLineups";
import { isMatchLive, matchStatusMeta } from "@/lib/matchStatus";

export default function MatchPage() {
  const { id } = useParams();
  const [m, setM] = useState(undefined);
  const [clubs, setClubs] = useState({});
  const [events, setEvents] = useState([]);
  const [players, setPlayers] = useState({});
  const [comp, setComp] = useState(null);
  const [lineups, setLineups] = useState([]);
  const [matchPlayerStats, setMatchPlayerStats] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [realtime, setRealtime] = useState("connecting");
  const eventRefreshTimer = useRef(null);
  const L = useLabels();
  const refreshScore = useCallback(async () => {
    const { data } = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
    if (data) { setM(data); setLastUpdated(new Date()); }
  }, [id]);
  const refreshEvents = useCallback(async () => {
    const { data } = await supabase.from("match_events").select("*").eq("match_id", id).order("minute", { ascending: true });
    setEvents(data || []);
  }, [id]);
  const scheduleEventRefresh = useCallback(() => {
    window.clearTimeout(eventRefreshTimer.current);
    eventRefreshTimer.current = window.setTimeout(refreshEvents, 250);
  }, [refreshEvents]);
  useEffect(() => { (async () => {
    const { data: match } = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
    if (!match) { setM(null); return; }
    setM(match); setLastUpdated(new Date());
    const ids = [match.home_club_id, match.away_club_id].filter(Boolean);
    const [cl, ev, cp, li, ps] = await Promise.all([
      supabase.from("clubs").select("id,name,logo_url").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("match_events").select("*").eq("match_id", id).order("minute", { ascending: true }),
      match.competition_id ? supabase.from("competitions").select("id,name").eq("id", match.competition_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("match_lineups").select("*").eq("match_id", id),
      supabase.from("match_player_stats").select("*").eq("match_id", id),
    ]);
    setClubs(Object.fromEntries((cl.data || []).map((x) => [x.id, x]))); setEvents(ev.data || []); setComp(cp.data || null); setLineups(li.data || []); setMatchPlayerStats(ps.data || []);
    const pids = [...new Set([...(ev.data || []).map((e) => e.player_id), ...(ps.data || []).map((row) => row.player_id)].filter(Boolean))];
    if (pids.length) { const { data: pl } = await supabase.from("players").select("id,name").in("id", pids); setPlayers(Object.fromEntries((pl || []).map((p) => [p.id, p.name]))); }
  })().catch(() => setM(null)); }, [id]);
  useEffect(() => {
    const matchChannel = supabase.channel(`match-live-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${id}` }, (payload) => {
        if (payload.new?.id) { setM(payload.new); setLastUpdated(new Date()); }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events", filter: `match_id=eq.${id}` }, scheduleEventRefresh)
      .subscribe((status) => setRealtime(status === "SUBSCRIBED" ? "connected" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "fallback" : "connecting"));
    return () => { window.clearTimeout(eventRefreshTimer.current); supabase.removeChannel(matchChannel); };
  }, [id, scheduleEventRefresh]);
  useEffect(() => {
    if (!isMatchLive(m)) return undefined;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") { refreshScore(); refreshEvents(); } }, 30000);
    return () => window.clearInterval(timer);
  }, [m, refreshEvents, refreshScore]);
  if (m === undefined) return <p className="text-muted">Chargement…</p>;
  if (m === null) return <p className="text-muted">Match introuvable.</p>;
  const h = clubs[m.home_club_id] || {}, a = clubs[m.away_club_id] || {};
  const status = matchStatusMeta(m);
  const icon = (t) => ({ goal: "⚽", yellow: "🟨", red: "🟥", sub: "🔁" }[t] || "•");
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-2 text-center text-xs uppercase tracking-wider text-muted">{comp?.name}{m.matchday ? ` · Journée ${m.matchday}` : ""}</div>
      <div className={`mb-3 flex items-center justify-center gap-4 rounded-3xl border bg-gradient-to-br from-surface via-surface2 to-bg px-4 py-7 shadow-[0_24px_70px_-42px_rgba(0,0,0,0.9)] ${status.live ? "border-red-500/30" : "border-line/10"}`}>
        <div className="flex flex-1 flex-col items-center gap-2">{h.logo_url && <img src={h.logo_url} className="h-14 w-14 object-contain" alt="" />}<span className="text-center font-semibold">{h.name}</span></div>
        <div className="shrink-0 text-center">
          <div className="text-3xl font-black tabular-nums">{m.home_score ?? "-"} : {m.away_score ?? "-"}</div>
          <div className={`mt-1 text-xs font-bold ${status.live ? "text-red-400" : "text-muted"}`}>{status.live && <span className="mr-1 animate-pulse">●</span>}{status.label}</div>
          {m.kickoff && status.key !== "scheduled" && <div className="text-[10px] text-muted">{new Date(m.kickoff).toLocaleString("fr-BE")}</div>}
        </div>
        <div className="flex flex-1 flex-col items-center gap-2">{a.logo_url && <img src={a.logo_url} className="h-14 w-14 object-contain" alt="" />}<span className="text-center font-semibold">{a.name}</span></div>
      </div>
      <div className="mb-8 flex items-center justify-center gap-2 text-[10px] text-muted"><span className={`h-1.5 w-1.5 rounded-full ${realtime === "connected" ? "bg-green-400" : realtime === "fallback" ? "bg-amber-400" : "bg-muted"}`} />{realtime === "connected" ? "Direct connecté" : realtime === "fallback" ? "Actualisation automatique" : "Connexion…"}{lastUpdated && <span>· {lastUpdated.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}<button type="button" onClick={() => { refreshScore(); refreshEvents(); }} aria-label="Actualiser le match" className="rounded p-1 hover:bg-surface"><RefreshCw size={11} /></button></div>
      {(lineups.length > 0 || matchPlayerStats.length > 0) && <section className="mb-8"><div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-lg font-black">{L("match.lineups", "Compositions")}</h2><p className="text-xs text-muted">{L("match.lineups.subtitle", "Titulaires, formations et performances individuelles")}</p></div></div><MatchLineups homeClub={h} awayClub={a} lineups={lineups} rows={matchPlayerStats} labels={{ starters: L("match.starters", "Titulaires"), bench: L("match.bench", "Remplaçants"), formationEmpty: L("match.formation.empty", "Formation non renseignée"), startersEmpty: L("match.starters.empty", "Aucun titulaire importé."), home: L("match.home", "Domicile"), away: L("match.away", "Extérieur") }} /></section>}
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted">{status.live && <Radio size={14} className="text-red-400" />}{L("match.events", "Faits du match")}</h2>
      {events.length === 0
        ? <p className="text-sm text-muted">Aucun événement importé (lance « ⚽ Événements de match » dans l'admin).</p>
        : <div className="divide-y divide-line/10 rounded-xl border border-line/10">{events.map((e, i) => {
            const name = e.player_name || players[e.player_id] || "—";
            let line = name, sub = null;
            if (e.type === "goal") { if (e.detail && !/normal/i.test(e.detail)) line += ` (${e.detail})`; if (e.assist_name) sub = `Passe : ${e.assist_name}`; }
            else if ((e.type === "yellow" || e.type === "red") && e.detail) sub = e.detail;
            else if (e.type === "sub") { line = `${name} ↓`; if (e.assist_name) sub = `${e.assist_name} ↑`; }
            return (
              <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-sm">
                <span className="w-8 shrink-0 text-right text-muted tabular-nums">{e.minute != null ? e.minute + "'" : ""}</span>
                <span className="shrink-0">{icon(e.type)}</span>
                <span className="min-w-0 flex-1"><span className="font-medium">{line}</span>{sub && <span className="block text-xs text-muted">{sub}</span>}</span>
                {clubs[e.club_id]?.logo_url && <img src={clubs[e.club_id].logo_url} className="h-4 w-4 shrink-0 object-contain" alt="" />}
              </div>
            );
          })}</div>}
    </div>
  );
}
