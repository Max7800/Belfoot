"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Building2, ExternalLink, MapPin, Shield, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";
import CollapsibleSection from "@/components/CollapsibleSection";
import { useClubSections } from "@/lib/clubSections";
import { computeStandings } from "@/lib/standings";
import { competitionPhases, getCompetitionType } from "@/lib/competitionType";

const POS = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };
const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
const safeWebsite = (value) => /^https?:\/\//i.test(value || "") ? value : null;

export default function ClubPage() {
  const { id } = useParams();
  const sections = useClubSections();
  const [club, setClub] = useState(undefined);
  const [matches, setMatches] = useState([]);
  const [clubsMap, setClubsMap] = useState({});
  const [players, setPlayers] = useState([]);
  const [coach, setCoach] = useState(null);
  const [linked, setLinked] = useState([]);
  const [sport, setSport] = useState(null);

  useEffect(() => { (async () => {
    const { data: c } = await supabase.from("clubs").select("*").eq("id", id).maybeSingle();
    if (!c) { setClub(null); return; }
    setClub(c);
    const { data: m } = await supabase.from("matches").select("*").or(`home_club_id.eq.${id},away_club_id.eq.${id}`).order("kickoff", { ascending: false }).limit(100);
    const clubMatches = m || []; setMatches(clubMatches);
    const ids = [...new Set(clubMatches.flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
    const contexts = new Map();
    clubMatches.filter((match) => match.competition_id && match.season_id).forEach((match) => {
      const key = `${match.competition_id}:${match.season_id}`; const current = contexts.get(key) || { count: 0, latest: 0, match };
      current.count += 1; current.latest = Math.max(current.latest, new Date(match.kickoff || 0).getTime() || 0); current.match = match; contexts.set(key, current);
    });
    const contextMatch = [...contexts.values()].sort((a, b) => b.count - a.count || b.latest - a.latest)[0]?.match;
    const [clubResult, playerResult, coachResult, linkedResult] = await Promise.all([
      ids.length ? supabase.from("clubs").select("id,name,logo_url").in("id", ids) : Promise.resolve({ data: [] }),
      supabase.from("players").select("*").eq("club_id", id).order("name"),
      supabase.from("coaches").select("*").eq("club_id", id).limit(1).maybeSingle(),
      supabase.from("clubs").select("id,name,logo_url,team_type").or(`parent_club_id.eq.${id},id.eq.${c.parent_club_id || "00000000-0000-0000-0000-000000000000"}`),
    ]);
    setClubsMap(Object.fromEntries((clubResult.data || []).map((item) => [item.id, item])));
    setPlayers(playerResult.data || []); setCoach(coachResult.data || null); setLinked((linkedResult.data || []).filter((item) => item.id !== id));

    if (contextMatch) {
      const [competitionResult, seasonResult, allMatchesResult] = await Promise.all([
        supabase.from("competitions").select("*").eq("id", contextMatch.competition_id).maybeSingle(),
        supabase.from("seasons").select("*").eq("id", contextMatch.season_id).maybeSingle(),
        supabase.from("matches").select("*").eq("competition_id", contextMatch.competition_id).eq("season_id", contextMatch.season_id),
      ]);
      const competition = competitionResult.data; const allMatches = allMatchesResult.data || [];
      const type = getCompetitionType(competition, allMatches);
      const phases = competitionPhases(allMatches, type);
      const phase = phases.includes(contextMatch.phase) ? contextMatch.phase : phases[0];
      const phaseMatches = allMatches.filter((match) => (match.phase || "—") === phase);
      const finishedPhase = phaseMatches.filter((match) => match.status === "finished" && match.home_score != null && match.away_score != null);
      const standings = type === "cup" ? [] : computeStandings(finishedPhase);
      setSport({ competition, season: seasonResult.data, phase, standings, row: standings.find((row) => row.club === id), teamMatches: finishedPhase.filter((match) => match.home_club_id === id || match.away_club_id === id) });
    }
  })().catch(() => setClub(null)); }, [id]);

  if (club === undefined) return <p className="text-muted">Chargement…</p>;
  if (club === null) return <p className="text-muted">Club introuvable.</p>;

  const finished = matches.filter((match) => match.status === "finished");
  const upcoming = matches.filter((match) => match.status !== "finished").sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));
  const squad = [...players].sort((a, b) => (POS[a.position] ?? 9) - (POS[b.position] ?? 9) || (a.name || "").localeCompare(b.name || ""));
  const honours = Array.isArray(club.honours) ? club.honours : [];
  const website = safeWebsite(club.website_url);
  const primary = safeColor(club.primary_color, "#2563eb");
  const secondary = safeColor(club.secondary_color, "#ef4444");
  const teamStats = sport?.teamMatches || [];
  let wins = 0; let draws = 0; let losses = 0; let goalsFor = 0; let goalsAgainst = 0;
  teamStats.forEach((match) => { const home = match.home_club_id === id; const gf = home ? match.home_score : match.away_score; const ga = home ? match.away_score : match.home_score; goalsFor += gf; goalsAgainst += ga; if (gf > ga) wins++; else if (gf === ga) draws++; else losses++; });

  const Fact = ({ label, value }) => value !== null && value !== undefined && value !== "" ? <div className="rounded-xl border border-line/10 bg-bg/35 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</div><div className="mt-1 font-semibold">{value}</div></div> : null;
  const content = {
    identity: <div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Fact label="Nom complet" value={club.name} /><Fact label="Surnom" value={club.nickname} /><Fact label="Fondation" value={club.founded_year} /><Fact label="Ville" value={club.city} /></div>{club.description && <p className="mt-4 whitespace-pre-line text-sm leading-7 text-content/85">{club.description}</p>}{website && <a href={website} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">Site officiel <ExternalLink className="h-3.5 w-3.5" /></a>}</div>,
    ranking: sport?.row ? <div className="grid gap-3 sm:grid-cols-[170px_1fr]"><div className="flex items-center justify-center rounded-2xl border p-5 text-center" style={{ borderColor: `${primary}70`, background: `${primary}12` }}><div><div className="text-5xl font-black" style={{ color: primary }}>{sport.standings.findIndex((row) => row.club === id) + 1}<sup className="text-base">e</sup></div><div className="mt-1 text-xs text-muted">sur {sport.standings.length}</div></div></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Fact label="Compétition" value={sport.competition?.name} /><Fact label="Saison" value={sport.season?.label} /><Fact label="Phase" value={sport.phase} /><Fact label="Points" value={sport.row.pts} /></div></div> : <p className="text-sm text-muted">Aucun classement disponible pour la saison active.</p>,
    stats: teamStats.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">{[[teamStats.length, "Matchs"], [wins, "Victoires"], [draws, "Nuls"], [losses, "Défaites"], [goalsFor, "Buts pour"], [goalsAgainst, "Buts contre"], [goalsFor - goalsAgainst, "Différence"]].map(([value, label]) => <div key={label} className="rounded-xl border border-line/10 bg-bg/35 p-3 text-center"><div className="text-xl font-black">{value > 0 && label === "Différence" ? `+${value}` : value}</div><div className="mt-1 text-[10px] uppercase tracking-wide text-muted">{label}</div></div>)}</div> : <p className="text-sm text-muted">Aucune statistique disponible.</p>,
    stadium: (club.stadium_name || club.stadium_image_url || club.stadium_address) ? <div className="grid overflow-hidden rounded-2xl border border-line/10 bg-bg/35 sm:grid-cols-2">{club.stadium_image_url ? <img src={club.stadium_image_url} className="h-52 w-full object-cover" alt={club.stadium_name || "Stade"} /> : <div className="flex h-52 items-center justify-center bg-white/[0.025]"><Building2 className="h-12 w-12 text-muted/40" /></div>}<div className="flex flex-col justify-center p-5"><div className="text-xl font-black">{club.stadium_name || "Stade"}</div>{club.stadium_capacity && <div className="mt-2 text-sm text-muted">{Number(club.stadium_capacity).toLocaleString("fr-BE")} places</div>}{club.stadium_address && <div className="mt-3 flex items-start gap-2 text-sm text-muted"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{club.stadium_address}</div>}</div></div> : <p className="text-sm text-muted">Informations du stade à compléter dans l'administration.</p>,
    honours: honours.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{honours.map((item, index) => <div key={`${item.title}-${index}`} className="flex items-center gap-3 rounded-2xl border border-line/10 bg-bg/35 p-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${secondary}18`, color: secondary }}><Trophy className="h-5 w-5" /></span><span className="min-w-0 flex-1"><b className="block">{item.title || "Trophée"}</b>{item.years && <span className="block truncate text-xs text-muted">{item.years}</span>}</span>{item.count && <b className="text-2xl" style={{ color: secondary }}>×{item.count}</b>}</div>)}</div> : <p className="text-sm text-muted">Palmarès à compléter dans l'administration.</p>,
    squad: squad.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{squad.map((player) => <Link key={player.id} href={`/players/${player.id}`} className="rounded-2xl border border-line/10 bg-bg/40 p-3 text-center transition hover:border-accent/40"><img src={player.photo_url || ""} className="mx-auto h-14 w-14 rounded-full object-cover" alt="" /><div className="mt-1 truncate text-sm font-bold">{player.name}</div><div className="text-xs text-muted">{[player.position, player.age ? `${player.age} ans` : null].filter(Boolean).join(" · ")}</div></Link>)}</div> : <p className="text-muted">—</p>,
    linked: linked.length ? <div className="flex flex-wrap gap-2">{linked.map((team) => <Link key={team.id} href={`/clubs/${team.id}`} className="flex items-center gap-2 rounded-xl border border-line/10 bg-bg/40 p-2 pr-3 text-sm transition hover:border-accent/40">{team.logo_url && <img src={team.logo_url} className="h-6 w-6 object-contain" alt="" />}<span className="font-semibold">{team.name}</span>{team.team_type && team.team_type !== "first_team" && <span className="text-[10px] uppercase text-muted">{team.team_type}</span>}</Link>)}</div> : <p className="text-muted">—</p>,
    last: finished.length ? <div className="space-y-2">{finished.slice(0, 10).map((match) => <MatchRow key={match.id} m={match} clubs={clubsMap} href={`/matchs/${match.id}`} />)}</div> : <p className="text-muted">—</p>,
    next: upcoming.length ? <div className="space-y-2">{upcoming.slice(0, 10).map((match) => <MatchRow key={match.id} m={match} clubs={clubsMap} href={`/matchs/${match.id}`} />)}</div> : <p className="text-muted">Aucun match à venir.</p>,
  };
  const counts = { honours: honours.length, squad: squad.length, linked: linked.length, last: finished.length, next: upcoming.length };

  return (
    <div>
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-line/10 p-5 sm:p-7" style={{ background: `linear-gradient(120deg, ${primary}26, ${secondary}12 58%, rgba(15,23,42,0.2))` }}>
        <Shield className="pointer-events-none absolute -bottom-12 -right-8 h-44 w-44 opacity-[0.05]" />
        <div className="relative flex items-center gap-4">{club.logo_url && <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/15 p-2"><img src={club.logo_url} className="h-full w-full object-contain" alt="" /></div>}<div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">{club.nickname || club.city || "Club"}</div><h1 className="truncate text-3xl font-black sm:text-4xl">{club.name}</h1>{coach && <div className="mt-2 flex items-center gap-2 text-sm text-muted">{coach.photo_url && <img src={coach.photo_url} className="h-6 w-6 rounded-full object-cover" alt="" />}Entraîneur : <b className="text-content">{coach.name}</b></div>}</div></div>
      </div>
      {sections.filter((section) => section.key !== "linked" || linked.length > 0).map((section) => (
        <CollapsibleSection key={section.key} id={`club-${section.key}`} title={section.label} count={counts[section.key]}>{content[section.key]}</CollapsibleSection>
      ))}
    </div>
  );
}
