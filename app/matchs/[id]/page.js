"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Radio, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useLabels } from "@/lib/labels";
import MatchLineups from "@/components/football/MatchLineups";
import MatchPlayerRatings from "@/components/football/MatchPlayerRatings";
import MatchTeamStats from "@/components/football/MatchTeamStats";
import DiableRatings from "@/components/football/DiableRatings";
import { isMatchLive, matchStatusMeta } from "@/lib/matchStatus";
import DiscussButton from "@/components/forum/DiscussButton";

const eventIcon = (type) => ({ goal: "⚽", yellow: "🟨", red: "🟥", sub: "🔁" }[type] || "•");

function EventList({ events, players, clubs, empty, limit }) {
  const shown = limit ? events.slice(-limit).reverse() : events;
  if (!shown.length) return <p className="rounded-2xl border border-dashed border-line/15 p-5 text-center text-sm text-muted">{empty}</p>;
  return <div className="divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/10 bg-surface/45">{shown.map((event, index) => {
    const name = event.player_name || players[event.player_id]?.name || "—";
    let line = name;
    let sub = null;
    if (event.type === "goal") {
      if (event.detail && !/normal/i.test(event.detail)) line += ` (${event.detail})`;
      if (event.assist_name) sub = `Passe : ${event.assist_name}`;
    } else if ((event.type === "yellow" || event.type === "red") && event.detail) sub = event.detail;
    else if (event.type === "sub") {
      line = `${name} ↓`;
      if (event.assist_name) sub = `${event.assist_name} ↑`;
    }
    return <div key={event.id || index} className="flex items-start gap-2 px-3 py-2 text-sm">
      <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-muted">{event.minute != null ? `${event.minute}'` : ""}</span>
      <span className="shrink-0">{eventIcon(event.type)}</span>
      <span className="min-w-0 flex-1"><span className="font-medium">{line}</span>{sub && <span className="block text-xs text-muted">{sub}</span>}</span>
      {clubs[event.club_id]?.logo_url && <img src={clubs[event.club_id].logo_url} className="h-4 w-4 shrink-0 object-contain" alt="" />}
    </div>;
  })}</div>;
}

export default function MatchPage() {
  const { id } = useParams();
  const [m, setM] = useState(undefined);
  const [clubs, setClubs] = useState({});
  const [events, setEvents] = useState([]);
  const [players, setPlayers] = useState({});
  const [comp, setComp] = useState(null);
  const [lineups, setLineups] = useState([]);
  const [matchPlayerStats, setMatchPlayerStats] = useState([]);
  const [teamStats, setTeamStats] = useState([]);
  const [callups, setCallups] = useState([]);
  const [activeTab, setActiveTab] = useState("summary");
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
    const [cl, ev, cp, li, ps, ts, ca] = await Promise.all([
      supabase.from("clubs").select("id,name,logo_url,team_type,national_followed,national_category,national_gender").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("match_events").select("*").eq("match_id", id).order("minute", { ascending: true }),
      match.competition_id ? supabase.from("competitions").select("id,name").eq("id", match.competition_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("match_lineups").select("*").eq("match_id", id),
      supabase.from("match_player_stats").select("*").eq("match_id", id),
      supabase.from("match_team_stats").select("*").eq("match_id", id),
      supabase.from("national_match_callups").select("*").eq("match_id", id),
    ]);
    const clubMap = Object.fromEntries((cl.data || []).map((club) => [club.id, club]));
    setClubs(clubMap); setEvents(ev.data || []); setComp(cp.data || null); setLineups(li.data || []); setMatchPlayerStats(ps.data || []); setTeamStats(ts.data || []); setCallups(ca.data || []);
    const playerIds = [...new Set([...(ev.data || []).map((event) => event.player_id), ...(ps.data || []).map((row) => row.player_id), ...(ca.data || []).map((row) => row.player_id)].filter(Boolean))];
    if (playerIds.length) {
      const { data: playerRows } = await supabase.from("players").select("id,name,photo_url").in("id", playerIds);
      setPlayers(Object.fromEntries((playerRows || []).map((player) => [player.id, player])));
    }
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

  const diableSquad = useMemo(() => {
    const nationalTeamId = Object.values(clubs).find((club) => club.team_type === "national" && club.national_followed && club.national_category === "senior" && (club.national_gender || "men") === "men")?.id;
    if (!nationalTeamId) return [];
    return callups.filter((row) => row.national_team_id === nationalTeamId && players[row.player_id]).map((row) => ({ ...row, player: players[row.player_id] }));
  }, [callups, clubs, players]);

  if (m === undefined) return <p className="text-muted">Chargement…</p>;
  if (m === null) return <p className="text-muted">Match introuvable.</p>;
  const home = clubs[m.home_club_id] || {};
  const away = clubs[m.away_club_id] || {};
  const status = matchStatusMeta(m);
  const tabs = [
    ["summary", "Résumé"], ["events", "Événements", events.length], ["lineups", "Compos", lineups.length],
    ["stats", "Stats", teamStats.length], ["players", "Joueurs", matchPlayerStats.length],
  ];
  const emptyEvents = "Aucun événement importé. Le job plafonné « Événements de match » permet de les récupérer.";

  return <div className="mx-auto max-w-5xl">
    <div className="mb-2 text-center text-xs uppercase tracking-wider text-muted">{comp?.name}{m.matchday ? ` · Journée ${m.matchday}` : ""}</div>
    <div className={`mb-3 flex items-center justify-center gap-3 rounded-3xl border bg-gradient-to-br from-surface via-surface2 to-bg px-3 py-6 shadow-[0_24px_70px_-42px_rgba(0,0,0,0.9)] sm:gap-6 sm:px-6 sm:py-8 ${status.live ? "border-red-500/30" : "border-line/10"}`}>
      {m.home_club_id ? <Link href={`/clubs/${m.home_club_id}`} className="flex min-w-0 flex-1 flex-col items-center gap-2 transition hover:opacity-80">{home.logo_url && <img src={home.logo_url} className="h-14 w-14 object-contain sm:h-20 sm:w-20" alt="" />}<span className="text-center text-sm font-bold hover:text-accent sm:text-base">{home.name}</span></Link> : <div className="flex min-w-0 flex-1 flex-col items-center gap-2">{home.logo_url && <img src={home.logo_url} className="h-14 w-14 object-contain sm:h-20 sm:w-20" alt="" />}<span className="text-center text-sm font-bold sm:text-base">{home.name}</span></div>}
      <div className="shrink-0 text-center"><div className="text-3xl font-black tabular-nums sm:text-4xl">{m.home_score ?? "-"} : {m.away_score ?? "-"}</div><div className={`mt-1 text-xs font-bold ${status.live ? "text-red-400" : "text-muted"}`}>{status.live && <span className="mr-1 animate-pulse">●</span>}{status.label}</div>{m.kickoff && <div className="mt-1 max-w-28 text-[10px] text-muted">{new Date(m.kickoff).toLocaleString("fr-BE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}</div>
      {m.away_club_id ? <Link href={`/clubs/${m.away_club_id}`} className="flex min-w-0 flex-1 flex-col items-center gap-2 transition hover:opacity-80">{away.logo_url && <img src={away.logo_url} className="h-14 w-14 object-contain sm:h-20 sm:w-20" alt="" />}<span className="text-center text-sm font-bold hover:text-accent sm:text-base">{away.name}</span></Link> : <div className="flex min-w-0 flex-1 flex-col items-center gap-2">{away.logo_url && <img src={away.logo_url} className="h-14 w-14 object-contain sm:h-20 sm:w-20" alt="" />}<span className="text-center text-sm font-bold sm:text-base">{away.name}</span></div>}
    </div>

    <div className="mb-5 flex flex-wrap items-center justify-center gap-2 text-[10px] text-muted"><span className={`h-1.5 w-1.5 rounded-full ${realtime === "connected" ? "bg-green-400" : realtime === "fallback" ? "bg-amber-400" : "bg-muted"}`} />{realtime === "connected" ? "Direct connecté" : realtime === "fallback" ? "Actualisation automatique" : "Connexion…"}{lastUpdated && <span>· {lastUpdated.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}<button type="button" onClick={() => { refreshScore(); refreshEvents(); }} aria-label="Actualiser le match" className="rounded p-1 hover:bg-surface"><RefreshCw size={11} /></button><DiscussButton refType="match" refId={id} title={`Discussion : ${home.name || "?"} - ${away.name || "?"}`} label="Discuter" /></div>

    <nav className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-line/10 bg-surface/70 p-1" aria-label="Contenu du match">{tabs.map(([key, label, count]) => <button key={key} type="button" onClick={() => setActiveTab(key)} className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition sm:flex-1 sm:justify-center ${activeTab === key ? "bg-white text-slate-950" : "text-muted hover:bg-white/[0.05] hover:text-white"}`}>{label}{count > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${activeTab === key ? "bg-slate-900/10" : "bg-white/[0.07]"}`}>{count}</span>}</button>)}</nav>

    {activeTab === "summary" && <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <section><h2 className="mb-3 text-sm font-black uppercase tracking-wider">Le match en chiffres</h2><MatchTeamStats homeClub={home} awayClub={away} rows={teamStats} compact /></section>
      <section><h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider">{status.live && <Radio size={14} className="text-red-400" />}Temps forts</h2><EventList events={events} players={players} clubs={clubs} empty={emptyEvents} limit={6} /></section>
      {diableSquad.length > 0 && <section className="lg:col-span-2"><DiableRatings match={m} squad={diableSquad} title="Notes des Diables de ce match" /></section>}
    </div>}
    {activeTab === "events" && <section><h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider">{status.live && <Radio size={14} className="text-red-400" />}{L("match.events", "Faits du match")}</h2><EventList events={events} players={players} clubs={clubs} empty={emptyEvents} /></section>}
    {activeTab === "lineups" && <section><div className="mb-3"><h2 className="text-lg font-black">{L("match.lineups", "Compositions")}</h2><p className="text-xs text-muted">{L("match.lineups.subtitle", "Titulaires, formations et remplaçants")}</p></div><MatchLineups homeClub={home} awayClub={away} lineups={lineups} rows={matchPlayerStats} labels={{ starters: L("match.starters", "Titulaires"), bench: L("match.bench", "Remplaçants"), formationEmpty: L("match.formation.empty", "Formation non renseignée"), startersEmpty: L("match.starters.empty", "Aucun titulaire importé."), home: L("match.home", "Domicile"), away: L("match.away", "Extérieur") }} /></section>}
    {activeTab === "stats" && <section><h2 className="mb-3 text-lg font-black">Statistiques collectives</h2><MatchTeamStats homeClub={home} awayClub={away} rows={teamStats} /></section>}
    {activeTab === "players" && <section><div className="mb-3"><h2 className="text-lg font-black">Performances des joueurs</h2><p className="text-xs text-muted">Minutes, note et actions décisives enregistrées pour ce match.</p></div><MatchPlayerRatings homeClub={home} awayClub={away} rows={matchPlayerStats} /></section>}
  </div>;
}
