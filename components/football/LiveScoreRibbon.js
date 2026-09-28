"use client";

import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMatchLive, matchStatusMeta } from "@/lib/matchStatus";
import { supabase } from "@/lib/supabaseClient";

function mergeMatches(...lists) {
  const rows = new Map();
  for (const match of lists.flat()) if (match?.id) rows.set(match.id, match);
  return [...rows.values()];
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isBelgiumTeam(club) {
  const name = normalize(club?.name);
  return Boolean(club?.national_followed && club?.national_category === "senior")
    || ["belgique", "belgium", "belgie"].includes(name);
}

function eventSummary(event) {
  if (!event) return null;
  const labels = { goal: "But", yellow: "Carton jaune", red: "Carton rouge", sub: "Changement" };
  const icons = { goal: "⚽", yellow: "🟨", red: "🟥", sub: "🔁" };
  return { icon: icons[event.type] || "●", label: labels[event.type] || "Événement", text: event.player_name || event.detail || "Mise à jour du match" };
}

function TeamRow({ club, score }) {
  return <div className="flex min-w-0 items-center gap-3">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] p-1.5">
      {club.logo_url ? <img src={club.logo_url} alt="" className="h-full w-full object-contain" /> : <span className="text-xs font-black text-white/35">—</span>}
    </span>
    <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{club.short_name || club.name || "Équipe"}</span>
    <b className="w-8 shrink-0 text-right text-2xl font-black tabular-nums text-white">{score ?? "–"}</b>
  </div>;
}

function FeaturedScore({ match, clubs, competition, events = [] }) {
  const home = clubs[match.home_club_id] || {};
  const away = clubs[match.away_club_id] || {};
  const status = matchStatusMeta(match);
  return <Link href={`/matchs/${match.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-red-400/25 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,.18),transparent_45%),rgba(0,0,0,.2)] p-4 transition hover:-translate-y-0.5 hover:border-red-300/45">
    <div className="mb-3 flex items-center gap-2 text-[10px] text-white/55">
      {competition?.logo_url && <img src={competition.logo_url} alt="" className="h-5 w-5 object-contain" />}
      <span className="min-w-0 flex-1 truncate font-bold">{competition?.name || "Compétition"}</span>
      <span className={`rounded-full px-2 py-1 font-black uppercase ${status.live ? "bg-red-500/20 text-red-200" : "bg-white/[0.07] text-white/65"}`}>{status.live && <i className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />}{status.compact}</span>
    </div>
    <div className="space-y-2 rounded-2xl bg-black/20 p-3"><TeamRow club={home} score={match.home_score} /><div className="h-px bg-white/[0.07]" /><TeamRow club={away} score={match.away_score} /></div>
    <div className="mt-3 flex flex-1 flex-col justify-end rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
      <div className="mb-1.5 text-[9px] font-black uppercase tracking-[.16em] text-white/40">Temps forts</div>
      {events.length ? <div className="space-y-1.5">{events.slice(0, 3).map((item) => {
        const event = eventSummary(item);
        return <div key={item.id} className="flex min-w-0 items-center gap-2 text-[11px]"><span>{event.icon}</span><b className="w-8 shrink-0 text-white/80">{item.minute != null ? `${item.minute}'` : "—"}</b><span className="truncate text-white/60">{event.text}</span></div>;
      })}</div> : <div className="flex items-center gap-2 text-[11px] text-white/55"><Radio size={13} className={status.live ? "text-red-300" : "text-white/40"} /><span>{status.live ? "Aucun but ni carton signalé pour le moment." : "Le suivi commencera au coup d’envoi."}</span></div>}
      <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-red-200">Suivre le match minute par minute <ArrowRight size={11} /></span>
    </div>
  </Link>;
}

function CompactScore({ match, clubs, competition, latestEvent }) {
  const home = clubs[match.home_club_id] || {};
  const away = clubs[match.away_club_id] || {};
  const status = matchStatusMeta(match);
  const event = eventSummary(latestEvent);
  return <Link href={`/matchs/${match.id}`} className="group block w-[264px] shrink-0 rounded-2xl border border-white/10 bg-black/15 p-3 transition hover:-translate-y-0.5 hover:border-white/25 sm:w-auto">
    <div className="mb-2 flex items-center gap-2 text-[9px] text-white/50">{competition?.logo_url && <img src={competition.logo_url} alt="" className="h-3.5 w-3.5 object-contain" />}<span className="min-w-0 flex-1 truncate font-semibold">{competition?.name || "Compétition"}</span><b className={status.live ? "text-red-300" : "text-white/60"}>{status.compact}</b></div>
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">{home.logo_url && <img src={home.logo_url} alt="" className="h-6 w-6 shrink-0 object-contain" />}<span className="min-w-0 flex-1 truncate text-xs font-bold text-white">{home.short_name || home.name || "—"}</span><b className="text-base tabular-nums text-white">{match.home_score ?? "–"}</b></div>
      <div className="flex items-center gap-2">{away.logo_url && <img src={away.logo_url} alt="" className="h-6 w-6 shrink-0 object-contain" />}<span className="min-w-0 flex-1 truncate text-xs font-bold text-white">{away.short_name || away.name || "—"}</span><b className="text-base tabular-nums text-white">{match.away_score ?? "–"}</b></div>
    </div>
    {event && <div className="mt-2 flex min-w-0 items-center gap-1.5 border-t border-white/[0.07] pt-2 text-[10px] text-white/50"><span>{event.icon}</span><b className="text-white/70">{latestEvent.minute != null ? `${latestEvent.minute}'` : "Actu"}</b><span className="truncate">{event.text}</span></div>}
  </Link>;
}

export default function LiveScoreRibbon({ config = {}, competitions = [], clubs = {}, followedClubIds = [] }) {
  const [matches, setMatches] = useState([]);
  const [eventsByMatch, setEventsByMatch] = useState({});
  const [loading, setLoading] = useState(true);
  const scroller = useRef(null);
  const eventRefreshTimer = useRef(null);
  const maxMatches = Math.min(20, Math.max(1, Number(config.max_matches) || 8));
  const competitionMap = useMemo(() => Object.fromEntries(competitions.map((competition) => [competition.id, competition])), [competitions]);
  const followed = useMemo(() => new Set(followedClubIds), [followedClubIds]);

  const loadEvents = useCallback(async (matchIds) => {
    if (!matchIds.length) { setEventsByMatch({}); return; }
    const { data } = await supabase.from("match_events").select("id,match_id,minute,type,player_name,detail,club_id").in("match_id", matchIds).order("minute", { ascending: false });
    const next = {};
    for (const event of data || []) {
      next[event.match_id] ||= [];
      if (next[event.match_id].length < 3) next[event.match_id].push(event);
    }
    setEventsByMatch(next);
  }, []);

  const load = useCallback(async () => {
    const ids = competitions.map((competition) => competition.id);
    if (!ids.length) { setLoading(false); return; }
    const now = new Date().toISOString();
    const [liveResult, upcomingResult] = await Promise.all([
      supabase.from("matches").select("*").in("competition_id", ids).eq("status", "live").order("kickoff", { ascending: true }),
      supabase.from("matches").select("*").in("competition_id", ids).eq("status", "scheduled").gte("kickoff", now).order("kickoff", { ascending: true }).limit(maxMatches + 1),
    ]);
    const liveRows = mergeMatches(liveResult.data || []).filter(isMatchLive);
    const next = liveRows.length ? liveRows : config.empty_mode === "hide" ? [] : (upcomingResult.data || []);
    const sorted = next.sort((a, b) => {
      const aBelgium = isBelgiumTeam(clubs[a.home_club_id]) || isBelgiumTeam(clubs[a.away_club_id]);
      const bBelgium = isBelgiumTeam(clubs[b.home_club_id]) || isBelgiumTeam(clubs[b.away_club_id]);
      const aFollowed = followed.has(a.home_club_id) || followed.has(a.away_club_id);
      const bFollowed = followed.has(b.home_club_id) || followed.has(b.away_club_id);
      return Number(bBelgium) - Number(aBelgium) || Number(bFollowed) - Number(aFollowed) || new Date(a.kickoff || 0) - new Date(b.kickoff || 0);
    });
    setMatches(sorted);
    await loadEvents(sorted.slice(0, maxMatches).map((match) => match.id));
    setLoading(false);
  }, [clubs, competitions, config.empty_mode, followed, loadEvents, maxMatches]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!competitions.length) return undefined;
    const ids = new Set(competitions.map((competition) => competition.id));
    const scheduleReload = () => { window.clearTimeout(eventRefreshTimer.current); eventRefreshTimer.current = window.setTimeout(load, 250); };
    const channel = supabase.channel("home-live-score-ribbon")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, (payload) => { if (ids.has(payload.new?.competition_id || payload.old?.competition_id)) scheduleReload(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events" }, scheduleReload)
      .subscribe();
    return () => { window.clearTimeout(eventRefreshTimer.current); supabase.removeChannel(channel); };
  }, [competitions, load]);

  const visible = matches.slice(0, maxMatches);
  const live = visible.some(isMatchLive);
  const featured = visible[0];
  const secondary = visible.slice(1);
  const displayedCount = Math.min(5, visible.length);
  if (!loading && !visible.length && config.empty_mode === "hide") return null;
  const scroll = (direction) => scroller.current?.scrollBy({ left: direction * 280, behavior: "smooth" });

  return <section className="overflow-hidden rounded-3xl border shadow-[0_24px_70px_-48px_rgba(239,68,68,.75)]" style={{ backgroundColor: config.background_color || "#101a2d", borderColor: config.border_color || "#7f1d2d" }}>
    <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
      <span className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${live ? "bg-red-500" : "bg-white/35"}`}>{live && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-60" />}</span>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-sm font-black text-white sm:text-base">{config.label || "Scores en direct"}</h2>{!loading && visible.length > 0 && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${live ? "bg-red-500/20 text-red-200" : "bg-white/10 text-white/55"}`}>{live ? `${matches.filter(isMatchLive).length} en direct` : "À venir"}</span>}</div>{config.subtitle && <p className="hidden truncate text-[11px] text-white/55 sm:block">{config.subtitle}</p>}</div>
      {secondary.length > 1 && <div className="hidden items-center gap-1 sm:flex"><button type="button" onClick={() => scroll(-1)} className="rounded-lg border border-white/10 p-1.5 text-white/60 hover:bg-white/5 hover:text-white" aria-label="Scores précédents"><ChevronLeft size={15} /></button><button type="button" onClick={() => scroll(1)} className="rounded-lg border border-white/10 p-1.5 text-white/60 hover:bg-white/5 hover:text-white" aria-label="Scores suivants"><ChevronRight size={15} /></button></div>}
      <Link href="/direct" className="flex shrink-0 items-center gap-1 text-[11px] font-black text-white hover:text-red-200">{config.action || "Voir tout le direct"}<ArrowRight size={13} /></Link>
    </div>
    {loading ? <div className="grid gap-3 p-3 sm:grid-cols-[minmax(260px,.9fr)_minmax(0,1.6fr)] sm:p-4"><div className="h-48 animate-pulse rounded-2xl bg-white/5" /><div className="h-48 animate-pulse rounded-2xl bg-white/5" /></div>
      : featured ? <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(280px,.85fr)_minmax(0,1.65fr)]">
        <FeaturedScore match={featured} clubs={clubs} competition={competitionMap[featured.competition_id]} events={eventsByMatch[featured.id] || []} />
        {secondary.length ? <div ref={scroller} className="flex snap-x gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:overflow-visible">
          {secondary.slice(0, 4).map((match) => <div key={match.id} className="snap-start"><CompactScore match={match} clubs={clubs} competition={competitionMap[match.competition_id]} latestEvent={eventsByMatch[match.id]?.[0]} /></div>)}
          {matches.length > displayedCount && <Link href="/direct" className="flex min-h-24 w-32 shrink-0 snap-start flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 text-center text-xs font-bold text-white/65 hover:border-white/30 hover:text-white sm:w-auto"><b className="text-xl text-white">+{matches.length - displayedCount}</b>autres matchs</Link>}
        </div> : <div className="flex min-h-32 items-center justify-center text-sm text-white/45">Un seul match à suivre pour le moment.</div>}
      </div> : <div className="flex min-h-28 items-center justify-center gap-2 p-4 text-sm font-semibold text-white/60"><Radio size={16} />Aucun match programmé pour le moment.</div>}
  </section>;
}
