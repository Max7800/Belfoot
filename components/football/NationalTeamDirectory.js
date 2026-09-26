"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, MapPin, Shield, Trophy, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { groupByPosition, positionGroup } from "@/lib/positions";
import { matchStatusMeta } from "@/lib/matchStatus";

const CATEGORY_LABELS = { senior: "Diables Rouges", u23: "U23", u21: "Espoirs U21", u20: "U20", u19: "U19", u18: "U18", u17: "U17", women: "Red Flames" };
const CATEGORY_ORDER = ["senior", "u21", "u19", "u17", "u23", "u20", "u18", "women"];

function dateLabel(value) {
  if (!value) return "Date à confirmer";
  return new Date(value).toLocaleString("fr-BE", { weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function TeamBadge({ club }) {
  return <div className="flex min-w-0 flex-1 items-center gap-2">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/10 bg-surface2">{club?.logo_url ? <img src={club.logo_url} alt="" className="h-7 w-7 object-contain" /> : <Shield className="h-5 w-5 text-muted" />}</div>
    <span className="min-w-0 text-sm font-bold sm:text-base">{club?.name || "À confirmer"}</span>
  </div>;
}

function MatchCard({ match, clubs, competitions }) {
  const home = clubs[match.home_club_id] || {};
  const away = clubs[match.away_club_id] || {};
  const status = matchStatusMeta(match);
  const venue = match.ext?.venue_name || match.ext?.venue_city;
  return <Link href={`/matchs/${match.id}`} className="group block rounded-2xl border border-line/10 bg-surface/70 p-4 transition hover:-translate-y-0.5 hover:border-red-400/35">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <span className="rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-200">{competitions[match.competition_id]?.name || "Match international"}</span>
      <time className="text-[11px] text-muted">{dateLabel(match.kickoff)}</time>
    </div>
    <div className="flex items-center gap-3"><TeamBadge club={home} /><div className="shrink-0 rounded-xl border border-line/10 bg-bg/70 px-3 py-2 text-sm font-black tabular-nums">{status.key === "scheduled" ? "VS" : `${match.home_score ?? "-"} : ${match.away_score ?? "-"}`}</div><TeamBadge club={away} /></div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted"><span className={status.live ? "font-bold text-red-300" : ""}>{status.label}</span>{venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{venue}</span>}</div>
  </Link>;
}

function TeamSelector({ teams, selectedId, onSelect }) {
  const genders = [...new Set(teams.map((team) => team.national_gender || "men"))];
  return <div className="space-y-3">
    {genders.length > 1 && <div className="flex flex-wrap gap-2">{genders.map((gender) => <span key={gender} className="text-[10px] font-black uppercase tracking-wider text-muted">{gender === "women" ? "Femmes" : "Hommes"}</span>)}</div>}
    <div className="flex gap-2 overflow-x-auto pb-1">{teams.map((team) => <button key={team.id} type="button" onClick={() => onSelect(team.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${selectedId === team.id ? "border-red-400/50 bg-red-500/15 text-white" : "border-line/10 bg-surface text-muted hover:text-white"}`}>{team.logo_url && <img src={team.logo_url} alt="" className="h-5 w-5 object-contain" />}{CATEGORY_LABELS[team.national_category] || team.name}</button>)}</div>
  </div>;
}

export default function NationalTeamDirectory({ mode }) {
  const searchParams = useSearchParams();
  const requestedTeamId = searchParams.get("equipe") || "";
  const [teams, setTeams] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [matches, setMatches] = useState([]);
  const [clubs, setClubs] = useState({});
  const [competitions, setCompetitions] = useState({});
  const [squad, setSquad] = useState([]);
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [competitionFilter, setCompetitionFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from("clubs").select("id,name,logo_url,national_category,national_gender").eq("team_type", "national").eq("national_followed", true).then(({ data, error: teamsError }) => {
      if (teamsError) { setError(teamsError.message); setLoading(false); return; }
      const sorted = (data || []).sort((a, b) => CATEGORY_ORDER.indexOf(a.national_category) - CATEGORY_ORDER.indexOf(b.national_category));
      setTeams(sorted);
      const requested = sorted.find((team) => team.id === requestedTeamId);
      setSelectedId(requested?.id || sorted[0]?.id || "");
      if (!sorted.length) setLoading(false);
    });
  }, [requestedTeamId]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setError("");
    (async () => {
      if (mode === "matches") {
        const { data: rows, error: matchesError } = await supabase.from("matches").select("*").or(`home_club_id.eq.${selectedId},away_club_id.eq.${selectedId}`).order("kickoff", { ascending: false }).limit(240);
        if (matchesError) throw matchesError;
        const matchRows = rows || [];
        const clubIds = [...new Set(matchRows.flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
        const competitionIds = [...new Set(matchRows.map((match) => match.competition_id).filter(Boolean))];
        const [clubResult, competitionResult] = await Promise.all([
          clubIds.length ? supabase.from("clubs").select("id,name,logo_url").in("id", clubIds) : Promise.resolve({ data: [], error: null }),
          competitionIds.length ? supabase.from("competitions").select("id,name,logo_url").in("id", competitionIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (clubResult.error || competitionResult.error) throw clubResult.error || competitionResult.error;
        setMatches(matchRows);
        setClubs(Object.fromEntries((clubResult.data || []).map((club) => [club.id, club])));
        setCompetitions(Object.fromEntries((competitionResult.data || []).map((competition) => [competition.id, competition])));
      } else {
        const { data: callups, error: callupsError } = await supabase.from("national_team_callups").select("*").eq("national_team_id", selectedId).eq("active", true).order("updated_at", { ascending: false });
        if (callupsError) throw callupsError;
        const uniqueCallups = [...new Map((callups || []).map((callup) => [callup.player_id, callup])).values()];
        const playerIds = uniqueCallups.map((callup) => callup.player_id).filter(Boolean);
        const { data: players, error: playersError } = playerIds.length ? await supabase.from("players").select("id,name,photo_url,position,club_id").in("id", playerIds) : { data: [], error: null };
        if (playersError) throw playersError;
        const playerMap = Object.fromEntries((players || []).map((player) => [player.id, player]));
        const clubIds = [...new Set((players || []).map((player) => player.club_id).filter(Boolean))];
        const { data: clubRows, error: clubsError } = clubIds.length ? await supabase.from("clubs").select("id,name,logo_url").in("id", clubIds) : { data: [], error: null };
        if (clubsError) throw clubsError;
        const clubMap = Object.fromEntries((clubRows || []).map((club) => [club.id, club]));
        setSquad(uniqueCallups.map((callup) => ({ ...callup, player: playerMap[callup.player_id], club: clubMap[playerMap[callup.player_id]?.club_id] })).filter((row) => row.player));
      }
      setLoading(false);
    })().catch((loadError) => { setError(loadError.message || String(loadError)); setLoading(false); });
  }, [mode, selectedId]);

  useEffect(() => {
    setPositionFilter("ALL");
    setCompetitionFilter("ALL");
  }, [mode, selectedId]);

  const selectedTeam = teams.find((team) => team.id === selectedId);
  const competitionOptions = useMemo(() => [...new Set(matches.map((match) => match.competition_id).filter(Boolean))].map((id) => ({ id, label: competitions[id]?.name || "Compétition internationale" })).sort((a, b) => a.label.localeCompare(b.label, "fr")), [matches, competitions]);
  const filteredMatches = useMemo(() => competitionFilter === "ALL" ? matches : matches.filter((match) => match.competition_id === competitionFilter), [matches, competitionFilter]);
  const upcoming = useMemo(() => filteredMatches.filter((match) => match.status === "live" || (match.status === "scheduled" && new Date(match.kickoff).getTime() >= Date.now())).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)), [filteredMatches]);
  const results = useMemo(() => filteredMatches.filter((match) => match.status === "finished").sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)), [filteredMatches]);
  const squadGroups = useMemo(() => groupByPosition(squad, (row) => row.position || row.player?.position), [squad]);
  const filteredSquadGroups = positionFilter === "ALL" ? squadGroups : squadGroups.filter((group) => group.key === positionFilter);

  return <div className="space-y-6">
    <Link href="/diables-rouges" className="inline-flex items-center gap-2 text-sm font-bold text-muted transition hover:text-white"><ArrowLeft className="h-4 w-4" />Retour aux Diables Rouges</Link>
    <header className="rounded-3xl border border-red-400/20 bg-gradient-to-br from-red-950/35 via-surface to-bg p-5 sm:p-8">
      <div className="text-[10px] font-black uppercase tracking-[.22em] text-amber-300">Sélections belges</div>
      <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-black uppercase sm:text-5xl">{mode === "matches" ? "Tous les matchs" : "La sélection complète"}</h1>{selectedTeam && <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-slate-300">{CATEGORY_LABELS[selectedTeam.national_category] || selectedTeam.name}</span>}</div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{mode === "matches" ? "Le calendrier complet de la Belgique, avec la compétition de chaque rencontre clairement identifiée." : "Tous les joueurs actuellement appelés, regroupés par poste avec leur club actuel."}</p>
      <div className="mt-5"><TeamSelector teams={teams} selectedId={selectedId} onSelect={setSelectedId} /></div>
    </header>

    {!loading && !error && mode === "matches" && competitionOptions.length > 1 && <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"><button type="button" onClick={() => setCompetitionFilter("ALL")} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition ${competitionFilter === "ALL" ? "border-red-400/50 bg-red-500/15 text-white" : "border-line/10 bg-surface text-muted"}`}>Toutes</button>{competitionOptions.map((competition) => <button key={competition.id} type="button" onClick={() => setCompetitionFilter(competition.id)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition ${competitionFilter === competition.id ? "border-red-400/50 bg-red-500/15 text-white" : "border-line/10 bg-surface text-muted"}`}>{competition.label}</button>)}</div>}

    {!loading && !error && mode === "squad" && squadGroups.length > 1 && <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"><button type="button" onClick={() => setPositionFilter("ALL")} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition ${positionFilter === "ALL" ? "border-amber-400/50 bg-amber-400/15 text-white" : "border-line/10 bg-surface text-muted"}`}>Tous · {squad.length}</button>{squadGroups.map((group) => <button key={group.key} type="button" onClick={() => setPositionFilter(group.key)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold transition ${positionFilter === group.key ? "border-amber-400/50 bg-amber-400/15 text-white" : "border-line/10 bg-surface text-muted"}`}>{group.label} · {group.rows.length}</button>)}</div>}

    {loading ? <div className="h-64 animate-pulse rounded-3xl bg-surface" /> : error ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-200">Chargement impossible : {error}</div> : mode === "matches" ? <>
      {upcoming.length > 0 && <section><h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider"><CalendarDays className="h-4 w-4 text-amber-300" />Prochains matchs</h2><div className="grid gap-3 lg:grid-cols-2">{upcoming.map((match) => <MatchCard key={match.id} match={match} clubs={clubs} competitions={competitions} />)}</div></section>}
      <section><h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider"><Trophy className="h-4 w-4 text-red-300" />Résultats</h2>{results.length ? <div className="grid gap-3 lg:grid-cols-2">{results.map((match) => <MatchCard key={match.id} match={match} clubs={clubs} competitions={competitions} />)}</div> : <p className="rounded-2xl border border-dashed border-line/15 p-8 text-center text-sm text-muted">Aucun résultat pour ce filtre.</p>}</section>
    </> : squad.length ? <div className="space-y-7">{filteredSquadGroups.map((group) => <section key={group.key}><h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider"><span className="h-5 w-1 rounded-full bg-amber-300" />{group.label} <span className="text-muted">· {group.rows.length}</span></h2><div className="grid gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">{group.rows.map((row) => <Link key={row.id} href={`/players/${row.player.id}`} className="group flex items-center gap-3 rounded-2xl border border-line/10 bg-surface/70 p-2.5 text-left transition hover:-translate-y-0.5 hover:border-amber-400/35 sm:block sm:p-4 sm:text-center"><div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/10 bg-surface2 sm:mx-auto sm:h-24 sm:w-24">{row.player.photo_url ? <img src={row.player.photo_url} alt="" className="h-full w-full object-cover object-top" /> : <Users className="m-3.5 h-7 w-7 text-muted sm:m-7 sm:h-10 sm:w-10" />}</div><div className="min-w-0 flex-1 sm:mt-3"><div className="truncate font-black group-hover:text-amber-300">{row.player.name}</div><div className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-muted sm:mt-1">{positionGroup(row.position || row.player.position).label}</div><div className="mt-1 truncate text-xs text-slate-400 sm:mt-2">{row.club?.name || "Club à compléter"}</div></div></Link>)}</div></section>)}</div> : <p className="rounded-2xl border border-dashed border-line/15 p-8 text-center text-sm text-muted">La sélection apparaîtra après sa synchronisation.</p>}
  </div>;
}
