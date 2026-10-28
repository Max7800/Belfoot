"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radio, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { isMatchFinished, isMatchLive, matchStatusMeta } from "@/lib/matchStatus";
import { dayStrip, dayWindow, defaultDay, matchesByDay } from "@/lib/liveDays";

// Scores en direct : barre de jours J-5 à J+7 (lib/liveDays.js), lignes de score
// compactes regroupées par compétition, Belgique et clubs de Belges en tête.
// Refonte après l'audit du 28/10/2026 (page vide après minuit, cartes de 180 px,
// titre en double, résultats de la veille inaccessibles).

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function isBelgiumTeam(club) {
  const name = normalize(club?.name);
  return Boolean(club?.national_followed && club?.national_category === "senior")
    || ["belgique", "belgium", "belgie"].includes(name);
}

function eventSummary(event) {
  if (!event) return null;
  const icons = { goal: "⚽", yellow: "🟨", red: "🟥", sub: "🔁" };
  return { icon: icons[event.type] || "●", text: event.player_name || event.detail || "Mise à jour du match" };
}

// Une ligne par équipe, score à droite (lisible sur téléphone : les noms ne sont
// plus coupés à 8 lettres comme avec « domicile – score – extérieur » sur une ligne).
function TeamLine({ club, score, dim, live }) {
  return <div className={`flex items-center gap-2 ${dim ? "text-muted" : "font-bold"}`}>
    {club?.logo_url ? <img src={club.logo_url} alt="" loading="lazy" className="h-5 w-5 flex-shrink-0 object-contain" /> : <span className="h-5 w-5 flex-shrink-0 rounded-full bg-white/[0.06]" />}
    <span className="min-w-0 flex-1 truncate">{club?.name || "—"}</span>
    <span className={`w-6 text-right font-black tabular-nums ${live ? "text-red-300" : ""}`}>{score ?? ""}</span>
  </div>;
}

function ScoreRow({ match, clubs, highlighted, latestEvent }) {
  const status = matchStatusMeta(match);
  const finished = isMatchFinished(match);
  const scored = match.home_score != null && match.away_score != null;
  // Match terminé : le perdant en retrait, comme sur un tableau de scores.
  const homeLost = finished && scored && match.home_score < match.away_score;
  const awayLost = finished && scored && match.away_score < match.home_score;
  const event = status.live ? eventSummary(latestEvent) : null;
  return <Link href={`/matchs/${match.id}`} className={`grid grid-cols-[3.2rem_minmax(0,1fr)] items-center gap-2 px-3 py-2 text-[13px] transition hover:bg-white/[0.03] ${highlighted ? "border-l-2 border-amber-300/70 bg-amber-300/[0.03]" : "border-l-2 border-transparent"}`}>
    <span className={`text-[11px] font-black tabular-nums ${status.live ? "text-red-400" : finished ? "text-muted" : "text-content/80"}`}>{status.live && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 align-middle" />}{status.compact}</span>
    <div className="min-w-0 space-y-1">
      <TeamLine club={clubs[match.home_club_id]} score={scored ? match.home_score : null} dim={homeLost} live={status.live} />
      <TeamLine club={clubs[match.away_club_id]} score={scored ? match.away_score : null} dim={awayLost} live={status.live} />
      {event && <div className="truncate text-[11px] text-muted">{event.icon} {latestEvent.minute != null ? `${latestEvent.minute}’ · ` : ""}{event.text}</div>}
    </div>
  </Link>;
}

export default function LiveMatchCenter({ competitions = [] }) {
  const [matches, setMatches] = useState([]);
  const [clubs, setClubs] = useState({});
  const [latestEvents, setLatestEvents] = useState({});
  const [followedClubs, setFollowedClubs] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [belgiansOnly, setBelgiansOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [realtime, setRealtime] = useState("connecting");
  const [lastUpdated, setLastUpdated] = useState(null);
  const refreshTimer = useRef(null);
  const loadedIds = useRef(new Set());
  const stripRef = useRef(null);
  const competitionMap = useMemo(() => Object.fromEntries(competitions.map((competition) => [competition.id, competition])), [competitions]);

  // Dernier fait de match, pour les matchs en direct seulement.
  const loadEvents = useCallback(async (liveIds) => {
    if (!liveIds.length) { setLatestEvents({}); return; }
    const { data } = await supabase.from("match_events").select("id,match_id,minute,type,player_name,detail").in("match_id", liveIds).order("minute", { ascending: false });
    const next = {};
    for (const event of data || []) if (!next[event.match_id]) next[event.match_id] = event;
    setLatestEvents(next);
  }, []);

  const load = useCallback(async () => {
    if (!competitions.length) { setLoading(false); return; }
    const { start, end } = dayWindow(new Date());
    const ids = competitions.map((competition) => competition.id);
    const [windowResult, liveResult, trackedResult] = await Promise.all([
      supabase.from("matches").select("*").in("competition_id", ids).gte("kickoff", start.toISOString()).lt("kickoff", end.toISOString()).order("kickoff", { ascending: true }),
      supabase.from("matches").select("*").in("competition_id", ids).eq("status", "live").order("kickoff", { ascending: true }),
      supabase.from("players").select("club_id").eq("tracked", true).eq("active", true).not("club_id", "is", null),
    ]);
    const merged = new Map([...(windowResult.data || []), ...(liveResult.data || [])].map((match) => [match.id, match]));
    const nextMatches = [...merged.values()].sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));
    loadedIds.current = new Set(nextMatches.map((match) => match.id));
    setMatches(nextMatches);
    setFollowedClubs(new Set((trackedResult.data || []).map((player) => player.club_id).filter(Boolean)));
    const clubIds = [...new Set(nextMatches.flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
    if (clubIds.length) {
      const clubResult = await supabase.from("clubs").select("id,name,logo_url,team_type,national_followed,national_category").in("id", clubIds);
      setClubs(Object.fromEntries((clubResult.data || []).map((club) => [club.id, club])));
    } else setClubs({});
    await loadEvents(nextMatches.filter(isMatchLive).map((match) => match.id));
    setLastUpdated(new Date());
    setLoading(false);
  }, [competitions, loadEvents]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!competitions.length) return undefined;
    const ids = new Set(competitions.map((competition) => competition.id));
    const scheduleLoad = () => { window.clearTimeout(refreshTimer.current); refreshTimer.current = window.setTimeout(load, 250); };
    const channel = supabase.channel("belfoot-live-match-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, (payload) => { if (ids.has(payload.new?.competition_id || payload.old?.competition_id)) scheduleLoad(); })
      // Faits d'un match affiché seulement (avant : tout fait de n'importe quel match rechargeait la page).
      .on("postgres_changes", { event: "*", schema: "public", table: "match_events" }, (payload) => { if (loadedIds.current.has(payload.new?.match_id || payload.old?.match_id)) scheduleLoad(); })
      .subscribe((status) => setRealtime(status === "SUBSCRIBED" ? "connected" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "fallback" : "connecting"));
    return () => { window.clearTimeout(refreshTimer.current); supabase.removeChannel(channel); };
  }, [competitions, load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const days = useMemo(() => dayStrip(new Date()), []);
  const byDay = useMemo(() => matchesByDay(matches), [matches]);
  const live = useMemo(() => matches.filter(isMatchLive), [matches]);
  const view = selected || (loading ? null : defaultDay(matches, new Date()));
  // Jour choisi visible dans la barre (mobile : la barre défile).
  useEffect(() => { stripRef.current?.querySelector("[aria-pressed='true']")?.scrollIntoView({ block: "nearest", inline: "center" }); }, [view]);

  // Mis en avant : la Belgique, et les clubs de Belges suivis hors des compétitions
  // belges (en Pro League, chaque match a des Belges : le repère n'y voudrait rien dire).
  const highlighted = useCallback((match) => isBelgiumTeam(clubs[match.home_club_id]) || isBelgiumTeam(clubs[match.away_club_id])
    || (competitionMap[match.competition_id]?.competition_scope !== "belgique" && (followedClubs.has(match.home_club_id) || followedClubs.has(match.away_club_id))), [clubs, followedClubs, competitionMap]);
  const shown = (view === "live" ? live : byDay[view] || []).filter((match) => !belgiansOnly || highlighted(match));
  // Compétitions : celles avec la Belgique ou des Belges d'abord, puis l'ordre du site.
  const groups = Object.values(shown.reduce((all, match) => {
    const key = match.competition_id || "other";
    (all[key] ||= { competition: competitionMap[key] || {}, matches: [] }).matches.push(match);
    return all;
  }, {})).sort((a, b) => Number(b.matches.some(highlighted)) - Number(a.matches.some(highlighted)) || (a.competition.position ?? 999) - (b.competition.position ?? 999));
  const viewDay = days.find((day) => day.key === view);
  const chip = (active) => `flex shrink-0 flex-col items-center rounded-xl border px-3 py-1.5 text-xs font-bold transition ${active ? "border-accent/60 bg-accent/10 text-content" : "border-line/10 text-muted hover:text-content"}`;

  return <section className="overflow-hidden rounded-3xl border border-line/10 bg-surface/50">
    <div className="flex items-center gap-2 border-b border-line/10 px-3 py-2 sm:px-4">
      <div ref={stripRef} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {live.length > 0 && <button type="button" aria-pressed={view === "live"} onClick={() => setSelected("live")} className={`${chip(view === "live")} border-red-500/40 text-red-300`}><span className="flex items-center gap-1"><Radio size={12} />Direct</span><span className="text-[10px]">{live.length}</span></button>}
        {days.map((day) => {
          const count = (byDay[day.key] || []).length;
          return <button key={day.key} type="button" aria-pressed={view === day.key} onClick={() => setSelected(day.key)} className={`${chip(view === day.key)} ${count ? "" : "opacity-45"}`}><span className="whitespace-nowrap">{day.label}</span><span className="text-[10px] font-semibold">{count ? `${count} match${count > 1 ? "s" : ""}` : "—"}</span></button>;
        })}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/10 px-4 py-2 text-[11px] text-muted">
      <b className="text-sm text-content">{view === "live" ? "En direct" : viewDay ? viewDay.long.charAt(0).toUpperCase() + viewDay.long.slice(1) : ""}</b>
      <label className="ml-auto flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={belgiansOnly} onChange={(event) => setBelgiansOnly(event.target.checked)} className="h-3.5 w-3.5 accent-[rgb(var(--accent))]" />Belgique et Belges seulement</label>
      <span className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${realtime === "connected" ? "bg-green-400" : realtime === "fallback" ? "bg-amber-400" : "bg-muted"}`} />{realtime === "connected" ? "Temps réel" : realtime === "fallback" ? "Mise à jour chaque minute" : "Connexion…"}{lastUpdated && ` · ${lastUpdated.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}`}<button type="button" onClick={load} aria-label="Actualiser" className="rounded p-1 hover:bg-white/5 hover:text-content"><RefreshCw size={12} /></button></span>
    </div>
    <div className="p-3 sm:p-4">
      {loading ? <div className="space-y-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded-xl bg-surface2" />)}</div>
        : groups.length ? <div className="grid items-start gap-4 lg:grid-cols-2">{groups.map(({ competition, matches: groupMatches }) => <section key={competition.id || "other"} className="overflow-hidden rounded-2xl border border-line/10 bg-bg/30">
          <header className="flex items-center gap-2 border-b border-line/10 px-3 py-2">{competition.logo_url && <img src={competition.logo_url} alt="" loading="lazy" className="h-5 w-5 object-contain" />}<h3 className="min-w-0 flex-1 truncate text-sm font-black">{competition.name || "Autres matchs"}</h3><span className="text-[10px] text-muted">{groupMatches.length} match{groupMatches.length > 1 ? "s" : ""}</span></header>
          <div className="divide-y divide-line/10">{[...groupMatches].sort((a, b) => Number(highlighted(b)) - Number(highlighted(a)) || new Date(a.kickoff || 0) - new Date(b.kickoff || 0)).map((match) => <ScoreRow key={match.id} match={match} clubs={clubs} highlighted={highlighted(match)} latestEvent={latestEvents[match.id]} />)}</div>
        </section>)}</div>
          : <div className="py-8 text-center"><Radio className="mx-auto h-7 w-7 text-muted/50" /><p className="mt-2 text-sm font-semibold">{belgiansOnly ? "Aucun match de la Belgique ou de Belges ce jour-là" : view === "live" ? "Aucun match en direct" : "Aucun match ce jour-là"}</p><p className="mt-1 text-xs text-muted">Choisis un autre jour dans la barre ci-dessus.</p></div>}
    </div>
  </section>;
}
