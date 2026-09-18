"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Radio, RefreshCw, Star } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { isMatchLive, matchStatusMeta, sameLocalDay } from "@/lib/matchStatus";

function mergeMatches(...lists) {
  const rows = new Map();
  for (const match of lists.flat()) if (match?.id) rows.set(match.id, match);
  return [...rows.values()].sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));
}

function LiveCard({ match, clubs, competitions, followedClubs }) {
  const home = clubs[match.home_club_id] || {};
  const away = clubs[match.away_club_id] || {};
  const competition = competitions[match.competition_id] || {};
  const status = matchStatusMeta(match);
  const followed = followedClubs.has(match.home_club_id) || followedClubs.has(match.away_club_id);
  const scored = match.home_score != null || match.away_score != null;
  return (
    <Link href={`/matchs/${match.id}`} className={`group block overflow-hidden rounded-2xl border bg-gradient-to-br from-surface via-surface2/80 to-bg/80 transition hover:-translate-y-0.5 ${status.live ? "border-red-500/35 shadow-[0_20px_55px_-38px_rgba(239,68,68,.95)]" : "border-line/10 hover:border-accent/35"}`}>
      <div className="flex items-center gap-2 border-b border-line/10 px-3 py-2 text-[10px] text-muted">
        {competition.logo_url && <img src={competition.logo_url} alt="" className="h-4 w-4 object-contain" />}
        <span className="min-w-0 flex-1 truncate font-semibold">{competition.name || "Compétition"}</span>
        {followed && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 font-bold text-amber-300"><Star size={9} fill="currentColor" /> Belge suivi</span>}
      </div>
      <div className="p-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="min-w-0 text-center">{home.logo_url && <img src={home.logo_url} alt="" className="mx-auto h-9 w-9 object-contain" />}<div className="mt-1 truncate text-xs font-bold">{home.name || "—"}</div></div>
          <div className="min-w-[68px] text-center"><div className="text-xl font-black tabular-nums">{scored ? `${match.home_score ?? 0} : ${match.away_score ?? 0}` : "–"}</div><div className={`mt-1 text-[10px] font-black uppercase tracking-wide ${status.live ? "text-red-400" : status.key === "finished" ? "text-content/70" : "text-muted"}`}>{status.live && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}{status.compact}</div></div>
          <div className="min-w-0 text-center">{away.logo_url && <img src={away.logo_url} alt="" className="mx-auto h-9 w-9 object-contain" />}<div className="mt-1 truncate text-xs font-bold">{away.name || "—"}</div></div>
        </div>
      </div>
    </Link>
  );
}

export default function LiveMatchCenter({ competitions = [] }) {
  const [matches, setMatches] = useState([]);
  const [clubs, setClubs] = useState({});
  const [followedClubs, setFollowedClubs] = useState(new Set());
  const [tab, setTab] = useState("today");
  const [loading, setLoading] = useState(true);
  const [realtime, setRealtime] = useState("connecting");
  const [lastUpdated, setLastUpdated] = useState(null);
  const initialTabChosen = useRef(false);
  const competitionMap = useMemo(() => Object.fromEntries(competitions.map((competition) => [competition.id, competition])), [competitions]);

  const load = useCallback(async () => {
    if (!competitions.length) return;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 8);
    const ids = competitions.map((competition) => competition.id);
    const [windowResult, liveResult, trackedResult] = await Promise.all([
      supabase.from("matches").select("*").in("competition_id", ids).gte("kickoff", start.toISOString()).lt("kickoff", end.toISOString()).order("kickoff", { ascending: true }),
      supabase.from("matches").select("*").in("competition_id", ids).eq("status", "live").order("kickoff", { ascending: true }),
      supabase.from("players").select("club_id").eq("tracked", true).eq("active", true).not("club_id", "is", null),
    ]);
    const nextMatches = mergeMatches(windowResult.data || [], liveResult.data || []);
    setMatches(nextMatches);
    setFollowedClubs(new Set((trackedResult.data || []).map((player) => player.club_id).filter(Boolean)));
    const clubIds = [...new Set(nextMatches.flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
    if (clubIds.length) {
      const clubResult = await supabase.from("clubs").select("id,name,logo_url").in("id", clubIds);
      setClubs(Object.fromEntries((clubResult.data || []).map((club) => [club.id, club])));
    }
    setLastUpdated(new Date());
    setLoading(false);
  }, [competitions]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!competitions.length) return undefined;
    const ids = new Set(competitions.map((competition) => competition.id));
    const channel = supabase.channel("belfoot-live-match-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, (payload) => {
        const changed = payload.new;
        if (!changed?.id || !ids.has(changed.competition_id)) return;
        setMatches((current) => mergeMatches(current.filter((match) => match.id !== changed.id), changed));
        setLastUpdated(new Date());
      })
      .subscribe((status) => setRealtime(status === "SUBSCRIBED" ? "connected" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "fallback" : "connecting"));
    return () => { supabase.removeChannel(channel); };
  }, [competitions]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const live = matches.filter(isMatchLive);
  const today = matches.filter((match) => sameLocalDay(match.kickoff));
  const upcoming = matches.filter((match) => !sameLocalDay(match.kickoff) && new Date(match.kickoff) > new Date() && match.status === "scheduled").slice(0, 12);
  const current = tab === "live" ? live : tab === "upcoming" ? upcoming : today;

  useEffect(() => {
    if (loading || initialTabChosen.current) return;
    initialTabChosen.current = true;
    if (live.length) setTab("live");
    else if (!today.length && upcoming.length) setTab("upcoming");
  }, [live.length, loading, today.length, upcoming.length]);

  const tabs = [
    { key: "live", label: "En direct", count: live.length, icon: Radio },
    { key: "today", label: "Aujourd'hui", count: today.length, icon: CalendarDays },
    { key: "upcoming", label: "À venir", count: upcoming.length, icon: CalendarDays },
  ];

  return (
    <section className="mb-8 overflow-hidden rounded-3xl border border-line/10 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,.12),transparent_38%),linear-gradient(135deg,var(--surface),var(--bg))] shadow-[0_28px_80px_-58px_rgba(239,68,68,.8)]">
      <div className="flex flex-col gap-4 border-b border-line/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div><div className="flex items-center gap-2"><span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" /></span><h2 className="text-lg font-black">Match Center</h2></div><p className="mt-1 text-xs text-muted">Scores et événements mis à jour sans recharger la page.</p></div>
        <div className="flex items-center gap-2 text-[10px] text-muted"><span className={`h-1.5 w-1.5 rounded-full ${realtime === "connected" ? "bg-green-400" : realtime === "fallback" ? "bg-amber-400" : "bg-muted"}`} />{realtime === "connected" ? "Temps réel connecté" : realtime === "fallback" ? "Actualisation chaque minute" : "Connexion au direct…"}{lastUpdated && <span className="hidden sm:inline">· {lastUpdated.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}</span>}<button type="button" onClick={load} aria-label="Actualiser" className="rounded p-1 hover:bg-white/5 hover:text-content"><RefreshCw size={12} /></button></div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-line/10 px-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-5">
        {tabs.map(({ key, label, count, icon: Icon }) => <button key={key} type="button" onClick={() => setTab(key)} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-xs font-bold transition ${tab === key ? "border-accent text-content" : "border-transparent text-muted hover:text-content"}`}><Icon size={13} className={key === "live" && count ? "text-red-400" : ""} />{label}<span className={`rounded-full px-1.5 py-0.5 text-[9px] ${key === "live" && count ? "bg-red-500/15 text-red-300" : "bg-white/5 text-muted"}`}>{count}</span></button>)}
      </div>
      <div className="p-4 sm:p-5">
        {loading ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-surface2" />)}</div>
          : current.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{current.map((match) => <LiveCard key={match.id} match={match} clubs={clubs} competitions={competitionMap} followedClubs={followedClubs} />)}</div>
          : <div className="py-7 text-center"><Radio className="mx-auto h-7 w-7 text-muted/50" /><p className="mt-2 text-sm font-semibold">{tab === "live" ? "Aucun match en direct" : tab === "today" ? "Aucun match aujourd'hui" : "Aucun match programmé dans les sept prochains jours"}</p><p className="mt-1 text-xs text-muted">Le calendrier complet reste disponible juste en dessous.</p></div>}
      </div>
    </section>
  );
}
