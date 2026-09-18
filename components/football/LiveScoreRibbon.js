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

function ScoreItem({ match, clubs, competition }) {
  const home = clubs[match.home_club_id] || {};
  const away = clubs[match.away_club_id] || {};
  const status = matchStatusMeta(match);
  const scored = match.home_score != null || match.away_score != null;
  return (
    <Link href={`/matchs/${match.id}`} className="group w-[272px] shrink-0 rounded-2xl border border-white/10 bg-black/15 p-3 transition hover:-translate-y-0.5 hover:border-white/25 sm:w-[292px]">
      <div className="mb-2 flex items-center gap-2 text-[10px] text-white/55">
        {competition?.logo_url && <img src={competition.logo_url} alt="" className="h-4 w-4 object-contain" />}
        <span className="min-w-0 flex-1 truncate font-semibold">{competition?.name || "Compétition"}</span>
        <span className={`shrink-0 font-black uppercase ${status.live ? "text-red-300" : "text-white/60"}`}>{status.live && <i className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />}{status.compact}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {home.logo_url && <img src={home.logo_url} alt="" className="h-7 w-7 shrink-0 object-contain" />}
          <span className="truncate text-xs font-bold text-white">{home.short_name || home.name || "—"}</span>
        </div>
        <div className="rounded-lg bg-black/35 px-2.5 py-1 text-base font-black tabular-nums text-white shadow-inner">{scored ? `${match.home_score ?? 0}–${match.away_score ?? 0}` : "–"}</div>
        <div className="flex min-w-0 flex-row-reverse items-center gap-2 text-right">
          {away.logo_url && <img src={away.logo_url} alt="" className="h-7 w-7 shrink-0 object-contain" />}
          <span className="truncate text-xs font-bold text-white">{away.short_name || away.name || "—"}</span>
        </div>
      </div>
    </Link>
  );
}

export default function LiveScoreRibbon({ config = {}, competitions = [], clubs = {}, followedClubIds = [] }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const scroller = useRef(null);
  const maxMatches = Math.min(20, Math.max(1, Number(config.max_matches) || 8));
  const competitionMap = useMemo(() => Object.fromEntries(competitions.map((competition) => [competition.id, competition])), [competitions]);
  const followed = useMemo(() => new Set(followedClubIds), [followedClubIds]);

  const load = useCallback(async () => {
    const ids = competitions.map((competition) => competition.id);
    if (!ids.length) { setLoading(false); return; }
    const now = new Date().toISOString();
    const [liveResult, upcomingResult] = await Promise.all([
      supabase.from("matches").select("*").in("competition_id", ids).eq("status", "live").order("kickoff", { ascending: true }),
      supabase.from("matches").select("*").in("competition_id", ids).eq("status", "scheduled").gte("kickoff", now).order("kickoff", { ascending: true }).limit(maxMatches + 1),
    ]);
    const live = mergeMatches(liveResult.data || []).filter(isMatchLive);
    const next = live.length ? live : config.empty_mode === "hide" ? [] : (upcomingResult.data || []);
    setMatches(next.sort((a, b) => {
      const aFollowed = followed.has(a.home_club_id) || followed.has(a.away_club_id);
      const bFollowed = followed.has(b.home_club_id) || followed.has(b.away_club_id);
      return Number(bFollowed) - Number(aFollowed) || new Date(a.kickoff || 0) - new Date(b.kickoff || 0);
    }));
    setLoading(false);
  }, [competitions, config.empty_mode, followed, maxMatches]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!competitions.length) return undefined;
    const ids = new Set(competitions.map((competition) => competition.id));
    const channel = supabase.channel("home-live-score-ribbon")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, (payload) => {
        if (ids.has(payload.new?.competition_id || payload.old?.competition_id)) load();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [competitions, load]);

  const visible = matches.slice(0, maxMatches);
  const live = visible.some(isMatchLive);
  if (!loading && !visible.length && config.empty_mode === "hide") return null;
  const scroll = (direction) => scroller.current?.scrollBy({ left: direction * 310, behavior: "smooth" });

  return (
    <section className="overflow-hidden rounded-3xl border shadow-[0_24px_70px_-48px_rgba(239,68,68,.75)]" style={{ backgroundColor: config.background_color || "#101a2d", borderColor: config.border_color || "#7f1d2d" }}>
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <span className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${live ? "bg-red-500" : "bg-white/35"}`}>{live && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-60" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h2 className="truncate text-sm font-black text-white sm:text-base">{config.label || "Scores en direct"}</h2>{!loading && visible.length > 0 && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${live ? "bg-red-500/20 text-red-200" : "bg-white/10 text-white/55"}`}>{live ? `${matches.filter(isMatchLive).length} en direct` : "À venir"}</span>}</div>
          {config.subtitle && <p className="hidden truncate text-[11px] text-white/55 sm:block">{config.subtitle}</p>}
        </div>
        <div className="hidden items-center gap-1 sm:flex"><button type="button" onClick={() => scroll(-1)} className="rounded-lg border border-white/10 p-1.5 text-white/60 hover:bg-white/5 hover:text-white" aria-label="Scores précédents"><ChevronLeft size={15} /></button><button type="button" onClick={() => scroll(1)} className="rounded-lg border border-white/10 p-1.5 text-white/60 hover:bg-white/5 hover:text-white" aria-label="Scores suivants"><ChevronRight size={15} /></button></div>
        <Link href="/direct" className="flex shrink-0 items-center gap-1 text-[11px] font-black text-white hover:text-red-200">{config.action || "Voir tout le direct"}<ArrowRight size={13} /></Link>
      </div>
      <div ref={scroller} className="flex snap-x gap-3 overflow-x-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:p-4">
        {loading ? [0, 1, 2].map((item) => <div key={item} className="h-[82px] w-[272px] shrink-0 animate-pulse rounded-2xl bg-white/5" />)
          : visible.length ? visible.map((match) => <div key={match.id} className="snap-start"><ScoreItem match={match} clubs={clubs} competition={competitionMap[match.competition_id]} /></div>)
            : <div className="flex min-h-[76px] w-full items-center justify-center gap-2 text-sm font-semibold text-white/60"><Radio size={16} />Aucun match programmé pour le moment.</div>}
        {matches.length > maxMatches && <Link href="/direct" className="flex w-32 shrink-0 snap-start flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 text-center text-xs font-bold text-white/65 hover:border-white/30 hover:text-white"><b className="text-xl text-white">+{matches.length - maxMatches}</b>autres matchs</Link>}
      </div>
    </section>
  );
}
