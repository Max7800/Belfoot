"use client";

import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMatchLive } from "@/lib/matchStatus";
import { supabase } from "@/lib/supabaseClient";
import { dayWindow, homeDefaultDay, matchesByDay, ribbonViewLabel } from "@/lib/liveDays";
import { ScoreRow, isBelgiumTeam } from "./ScoreLine";

// Bloc « Scores en direct » de l'accueil, refait le 30/10/2026 dans l'esprit de la
// page Direct (avant : une grande carte vedette, une grille de 4 cartes et « +4
// autres matchs », sans notion de jour). Vue par défaut : lib/liveDays.js (homeDefaultDay).
const DAYS_BACK = 2;
const DAYS_AHEAD = 7;

export default function LiveScoreRibbon({ config = {}, competitions = [], clubs: knownClubs = {}, followedClubIds = [] }) {
  const [matches, setMatches] = useState([]);
  const [extraClubs, setExtraClubs] = useState({});
  const [latestEvents, setLatestEvents] = useState({});
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef(null);
  const loadedIds = useRef(new Set());
  const maxMatches = Math.min(20, Math.max(1, Number(config.max_matches) || 8));
  const competitionMap = useMemo(() => Object.fromEntries(competitions.map((competition) => [competition.id, competition])), [competitions]);
  const followed = useMemo(() => new Set(followedClubIds), [followedClubIds]);
  const clubs = useMemo(() => ({ ...extraClubs, ...knownClubs }), [extraClubs, knownClubs]);

  const load = useCallback(async () => {
    const ids = competitions.map((competition) => competition.id);
    if (!ids.length) { setLoading(false); return; }
    const { start, end } = dayWindow(new Date(), DAYS_BACK, DAYS_AHEAD);
    const [windowResult, liveResult] = await Promise.all([
      supabase.from("matches").select("*").in("competition_id", ids).gte("kickoff", start.toISOString()).lt("kickoff", end.toISOString()).order("kickoff", { ascending: true }),
      supabase.from("matches").select("*").in("competition_id", ids).eq("status", "live"),
    ]);
    const merged = [...new Map([...(windowResult.data || []), ...(liveResult.data || [])].map((match) => [match.id, match])).values()];
    loadedIds.current = new Set(merged.map((match) => match.id));
    setMatches(merged);
    // Clubs absents des données de l'accueil (matchs hors de ses listes) : lus ici.
    const missing = [...new Set(merged.flatMap((match) => [match.home_club_id, match.away_club_id]).filter((id) => id && !knownClubs[id]))];
    if (missing.length) {
      const { data } = await supabase.from("clubs").select("id,name,short_name,logo_url,team_type,national_followed,national_category").in("id", missing);
      setExtraClubs(Object.fromEntries((data || []).map((club) => [club.id, club])));
    }
    const liveIds = merged.filter(isMatchLive).map((match) => match.id);
    if (liveIds.length) {
      const { data } = await supabase.from("match_events").select("id,match_id,minute,type,player_name,detail").in("match_id", liveIds).order("minute", { ascending: false });
      const next = {};
      for (const event of data || []) if (!next[event.match_id]) next[event.match_id] = event;
      setLatestEvents(next);
    } else setLatestEvents({});
    setLoading(false);
  }, [competitions, knownClubs]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!competitions.length) return undefined;
    const ids = new Set(competitions.map((competition) => competition.id));
    const scheduleReload = () => { window.clearTimeout(refreshTimer.current); refreshTimer.current = window.setTimeout(load, 250); };
    const channel = supabase.channel("home-live-score-ribbon")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, (payload) => { if (ids.has(payload.new?.competition_id || payload.old?.competition_id)) scheduleReload(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events" }, (payload) => { if (loadedIds.current.has(payload.new?.match_id || payload.old?.match_id)) scheduleReload(); })
      .subscribe();
    return () => { window.clearTimeout(refreshTimer.current); supabase.removeChannel(channel); };
  }, [competitions, load]);

  // Camp suivi : la Belgique, sinon le club d'un Belge suivi hors des compétitions belges.
  const followedSide = useCallback((match) => {
    if (isBelgiumTeam(clubs[match.home_club_id])) return "home";
    if (isBelgiumTeam(clubs[match.away_club_id])) return "away";
    if (competitionMap[match.competition_id]?.competition_scope === "belgique") return null;
    if (followed.has(match.home_club_id)) return "home";
    if (followed.has(match.away_club_id)) return "away";
    return null;
  }, [clubs, competitionMap, followed]);

  const view = loading ? null : homeDefaultDay(matches, new Date());
  const pool = view === "live" ? matches.filter(isMatchLive) : (matchesByDay(matches)[view] || []);
  const shown = [...pool].sort((a, b) => Number(Boolean(followedSide(b))) - Number(Boolean(followedSide(a))) || new Date(a.kickoff || 0) - new Date(b.kickoff || 0)).slice(0, maxMatches);
  const liveCount = matches.filter(isMatchLive).length;
  if (!loading && !shown.length && config.empty_mode === "hide") return null;

  return <section className="overflow-hidden rounded-3xl border shadow-[0_24px_70px_-48px_rgba(239,68,68,.75)]" style={{ backgroundColor: config.background_color || "#101a2d", borderColor: config.border_color || "#7f1d2d" }}>
    <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
      <span className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${liveCount ? "bg-red-500" : "bg-white/35"}`}>{liveCount > 0 && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-60" />}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><h2 className="truncate text-sm font-black text-white sm:text-base">{config.label || "Scores en direct"}</h2>{view && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${view === "live" ? "bg-red-500/20 text-red-200" : "bg-white/10 text-white/75"}`}>{ribbonViewLabel(view)}</span>}</div>
        {config.subtitle && <p className="hidden truncate text-[11px] text-white/55 sm:block">{config.subtitle}</p>}
      </div>
      <Link href="/direct" className="flex shrink-0 items-center gap-1 text-[11px] font-black text-white hover:text-red-200">{config.action || "Voir tout le direct"}<ArrowRight size={13} /></Link>
    </div>
    {loading ? <div className="grid gap-2 p-3 sm:p-4 lg:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-white/5" />)}</div>
      : shown.length ? <div className="p-3 sm:p-4">
        <div className="grid overflow-hidden rounded-2xl border border-white/10 bg-black/15 lg:grid-cols-2 lg:divide-x lg:divide-white/10">
          {[shown.filter((_, index) => index % 2 === 0), shown.filter((_, index) => index % 2 === 1)].map((column, index) => column.length > 0 && <div key={index} className="divide-y divide-white/10">{column.map((match) => <ScoreRow key={match.id} match={match} clubs={clubs} competition={competitionMap[match.competition_id]} highlighted={Boolean(followedSide(match))} followedSide={followedSide(match)} latestEvent={latestEvents[match.id]} />)}</div>)}
        </div>
        {pool.length > shown.length && <Link href="/direct" className="mt-2 flex items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 py-2 text-xs font-bold text-white/70 hover:border-white/30 hover:text-white">Voir les {pool.length - shown.length} autres matchs<ArrowRight size={12} /></Link>}
      </div>
        : <div className="flex min-h-28 items-center justify-center gap-2 p-4 text-sm font-semibold text-white/60"><Radio size={16} />Aucun match programmé pour le moment.</div>}
  </section>;
}
