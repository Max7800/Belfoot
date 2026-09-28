"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Globe2, MapPin, Shield, Star, Trophy, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useNationalTeamsConfig } from "@/lib/nationalTeams";
import { useRankings } from "@/lib/rankings";
import DiableRatings from "@/components/football/DiableRatings";
import { groupByPosition } from "@/lib/positions";
import { matchStatusMeta } from "@/lib/matchStatus";

const CATEGORY_LABELS = { senior: "Diables Rouges", u23: "U23", u21: "Espoirs U21", u20: "U20", u19: "U19", u18: "U18", u17: "U17", women: "Red Flames" };
const CATEGORY_ORDER = ["senior", "u21", "u19", "u17", "u23", "u20", "u18", "women"];
const COUNTRY_CODES = {
  Belgium: "be", Belgique: "be", France: "fr", Netherlands: "nl", "Pays-Bas": "nl", Germany: "de", Allemagne: "de", England: "gb-eng", Angleterre: "gb-eng", Spain: "es", Espagne: "es", Italy: "it", Italie: "it", Portugal: "pt", Croatia: "hr", Croatie: "hr", Denmark: "dk", Danemark: "dk", Sweden: "se", Suède: "se", Norway: "no", Norvège: "no", Finland: "fi", Finlande: "fi", Switzerland: "ch", Suisse: "ch", Austria: "at", Autriche: "at", Poland: "pl", Pologne: "pl", Ukraine: "ua", Scotland: "gb-sct", Écosse: "gb-sct", Wales: "gb-wls", "Pays de Galles": "gb-wls", Ireland: "ie", Irlande: "ie", Greece: "gr", Grèce: "gr", Turkey: "tr", Turquie: "tr", Romania: "ro", Roumanie: "ro", Hungary: "hu", Hongrie: "hu", Serbia: "rs", Serbie: "rs", Albania: "al", Albanie: "al", Slovakia: "sk", Slovaquie: "sk", Slovenia: "si", Slovénie: "si", Czechia: "cz", Tchéquie: "cz", "Czech Republic": "cz", Luxembourg: "lu", Kazakhstan: "kz", Kosovo: "xk", Morocco: "ma", Maroc: "ma", Brazil: "br", Brésil: "br", Argentina: "ar", Argentine: "ar", Uruguay: "uy", Colombia: "co", Colombie: "co", Mexico: "mx", Mexique: "mx", USA: "us", "États-Unis": "us", Canada: "ca", Japan: "jp", Japon: "jp", Senegal: "sn", Sénégal: "sn", Nigeria: "ng", Algeria: "dz", Algérie: "dz", Egypt: "eg", Égypte: "eg", Australia: "au", Australie: "au", Iran: "ir", Korea: "kr", "Corée du Sud": "kr",
};
const normalizeNationName = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9 -]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();
const NORMALIZED_COUNTRY_CODES = Object.fromEntries(Object.entries(COUNTRY_CODES).map(([name, code]) => [normalizeNationName(name), code]));

function countryCodeFor(name = "") {
  const clean = name.replace(/\s+(U\d+|W|Women)$/i, "").trim();
  return COUNTRY_CODES[clean] || NORMALIZED_COUNTRY_CODES[normalizeNationName(clean)] || null;
}

function CountryFlag({ nation, className = "h-4 w-6" }) {
  const code = countryCodeFor(nation);
  return code ? <img src={`https://flagcdn.com/${code}.svg`} alt="" className={`${className} rounded-[2px] object-cover shadow-sm`} /> : <span className={`flex items-center justify-center rounded bg-white/[0.05] text-muted ${className}`}><Globe2 className="h-3 w-3" /></span>;
}

function dateLabel(value, full = false) {
  if (!value) return "Date à confirmer";
  return new Date(value).toLocaleString("fr-BE", full
    ? { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function TeamVisual({ club, large = false }) {
  return <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
    <div className={`relative flex items-center justify-center rounded-2xl border border-white/10 bg-black/20 ${large ? "h-24 w-24 sm:h-28 sm:w-28" : "h-14 w-14"}`}>
      <CountryFlag nation={club?.name} className={`absolute opacity-25 ${large ? "h-14 w-20" : "h-8 w-11"}`} />
      {club?.logo_url && <img src={club.logo_url} alt="" className={`relative object-contain drop-shadow-xl ${large ? "h-16 w-16 sm:h-20 sm:w-20" : "h-9 w-9"}`} />}
    </div>
    <strong className={`${large ? "text-lg sm:text-2xl" : "text-xs"} max-w-full truncate`}>{club?.name || "À confirmer"}</strong>
    {large && club?.fifa_ranking != null && <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">FIFA #{club.fifa_ranking}</span>}
  </div>;
}

function FeaturedMatch({ match, clubs, competitions }) {
  if (!match) return <div className="rounded-3xl border border-dashed border-white/15 bg-black/10 p-8 text-center text-sm text-slate-300">Le prochain rendez-vous apparaîtra après la synchronisation du calendrier.</div>;
  const home = clubs[match.home_club_id] || {};
  const away = clubs[match.away_club_id] || {};
  const status = matchStatusMeta(match);
  const venue = match.ext?.venue_name || match.ext?.venue_city;
  return <Link href={`/matchs/${match.id}`} className="group block overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-black/35 via-slate-950/65 to-red-950/30 p-5 shadow-2xl transition hover:border-red-400/40 sm:p-8">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-slate-300"><span>{competitions[match.competition_id]?.name || "Match international"}</span><span className={status.live ? "text-red-300" : "text-amber-300"}>{status.live ? `● ${status.label}` : dateLabel(match.kickoff, true)}</span></div>
    <div className="flex items-center justify-center gap-3 sm:gap-8"><TeamVisual club={home} large /><div className="shrink-0 text-center"><div className="text-[10px] font-black uppercase tracking-[.2em] text-slate-400">{status.key === "scheduled" ? "Coup d’envoi" : status.label}</div><div className="mt-2 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-2xl font-black tabular-nums sm:text-4xl">{status.key === "scheduled" ? new Date(match.kickoff).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" }) : `${match.home_score ?? "-"} : ${match.away_score ?? "-"}`}</div></div><TeamVisual club={away} large /></div>
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300">{venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{venue}</span>}<span className="inline-flex items-center gap-1 font-bold text-white">Ouvrir le Match Center <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></span></div>
  </Link>;
}

function SmallMatch({ match, clubs, competitions, className = "" }) {
  const home = clubs[match.home_club_id] || {}, away = clubs[match.away_club_id] || {};
  const status = matchStatusMeta(match);
  return <Link href={`/matchs/${match.id}`} className={`min-w-[270px] rounded-2xl border border-white/10 bg-surface/75 p-4 transition hover:-translate-y-0.5 hover:border-red-400/35 sm:min-w-0 ${className}`}>
    <div className="flex items-center justify-between gap-2 text-[10px] text-muted"><span className="truncate">{competitions[match.competition_id]?.name || "International"}</span><time className="shrink-0">{dateLabel(match.kickoff)}</time></div>
    <div className="mt-4 flex items-center gap-2"><TeamVisual club={home} /><div className="shrink-0 rounded-xl border border-line/10 bg-surface2 px-3 py-2 text-center text-sm font-black tabular-nums">{status.key === "scheduled" ? "VS" : `${match.home_score ?? "-"} : ${match.away_score ?? "-"}`}</div><TeamVisual club={away} /></div>
  </Link>;
}

function PanelHeader({ icon: Icon, title, subtitle, accent = "#facc15", action, onAction, actionHref }) {
  return <div className="mb-4 flex items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-2.5"><Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} /><div className="min-w-0"><h2 className="text-xs font-black uppercase tracking-[.12em] text-white sm:text-sm">{title}</h2>{subtitle && <p className="mt-1 text-xs leading-5 text-muted">{subtitle}</p>}</div></div>
    {action && (actionHref ? <Link href={actionHref} className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted transition hover:text-white">{action}<ChevronRight className="h-3.5 w-3.5" /></Link> : <button type="button" onClick={onAction} className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted transition hover:text-white">{action}<ChevronRight className="h-3.5 w-3.5" /></button>)}
  </div>;
}

function ModuleCard({ children, className = "" }) {
  return <section className={`rounded-2xl border border-line/10 bg-surface/60 p-4 sm:p-5 ${className}`}>{children}</section>;
}

function SquadPreview({ rows, accent, className = "" }) {
  return <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${className}`}>{groupByPosition(rows, (row) => row.position || row.player?.position).map((group) => <section key={group.key} className="overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/50">
    <header className="flex items-center justify-between border-b border-line/10 bg-white/[0.025] px-3 py-2.5"><span className="flex items-center gap-2"><span className="h-4 w-1 rounded-full" style={{ backgroundColor: accent }} /><b className="text-[10px] uppercase tracking-wider text-slate-300">{group.label}</b></span><span className="text-[10px] font-bold text-muted">{group.rows.length}</span></header>
    <div className="divide-y divide-line/10">{group.rows.slice(0, 3).map((row) => <Link key={row.id} href={`/players/${row.player.id}`} className="group flex min-w-0 items-center gap-2.5 px-3 py-2.5 transition hover:bg-white/[0.025]">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-surface2">{row.player.photo_url ? <img src={row.player.photo_url} alt="" className="h-full w-full object-cover object-top" /> : <Users className="m-2.5 h-5 w-5 text-muted" />}</div>
      <span className="min-w-0 flex-1"><b className="block truncate text-xs group-hover:text-amber-300">{row.player.name}</b><span className="block truncate text-[10px] text-muted">{row.club?.name || row.position || row.player.position || "Joueur"}</span></span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-amber-300" />
    </Link>)}</div>
  </section>)}</div>;
}

function SquadNamesPreview({ rows, accent }) {
  return <div className="space-y-3">{groupByPosition(rows, (row) => row.position || row.player?.position).map((group) => <div key={group.key} className="rounded-xl border border-line/10 bg-bg/35 px-3 py-2.5">
    <div className="mb-1.5 flex items-center gap-2"><span className="h-3.5 w-1 rounded-full" style={{ backgroundColor: accent }} /><h3 className="text-[10px] font-black uppercase tracking-wider text-muted">{group.label} · {group.rows.length}</h3></div>
    <p className="text-sm font-semibold leading-6 text-slate-200">{group.rows.map((row) => row.player.name).join(" · ")}</p>
  </div>)}</div>;
}

export default function NationalTeamsPage() {
  const config = useNationalTeamsConfig();
  const rankings = useRankings();
  const [teams, setTeams] = useState([]);
  const [selectedGender, setSelectedGender] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [matches, setMatches] = useState([]);
  const [clubs, setClubs] = useState({});
  const [competitions, setCompetitions] = useState({});
  const [squad, setSquad] = useState([]);
  const [ratingSquad, setRatingSquad] = useState([]);
  const [preMatchSessions, setPreMatchSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);

  useEffect(() => {
    supabase.from("clubs").select("id,name,short_name,logo_url,national_category,national_gender,fifa_ranking").eq("team_type", "national").eq("national_followed", true).then(({ data, error }) => {
      if (error) { setSchemaMissing(true); setLoading(false); return; }
      const sorted = (data || []).sort((a, b) => CATEGORY_ORDER.indexOf(a.national_category) - CATEGORY_ORDER.indexOf(b.national_category));
      setTeams(sorted);
      setSelectedGender((current) => current || sorted[0]?.national_gender || "men");
      setSelectedId((current) => current || sorted[0]?.id || "");
      if (!sorted.length) setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setRatingSquad([]);
    setPreMatchSessions([]);
    (async () => {
      const [matchesResult, callupsResult] = await Promise.all([
        supabase.from("matches").select("*").or(`home_club_id.eq.${selectedId},away_club_id.eq.${selectedId}`).order("kickoff", { ascending: true }).limit(120),
        supabase.from("national_team_callups").select("*").eq("national_team_id", selectedId).eq("active", true).order("updated_at", { ascending: false }),
      ]);
      if (matchesResult.error || callupsResult.error) throw matchesResult.error || callupsResult.error;
      const matchRows = matchesResult.data || [];
      const callups = callupsResult.data || [];
      const clubIds = [...new Set(matchRows.flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
      const competitionIds = [...new Set(matchRows.map((match) => match.competition_id).filter(Boolean))];
      const playerIds = [...new Set(callups.map((callup) => callup.player_id).filter(Boolean))];
      const [clubsResult, competitionsResult, playersResult] = await Promise.all([
        clubIds.length ? supabase.from("clubs").select("id,name,short_name,logo_url").in("id", clubIds) : Promise.resolve({ data: [] }),
        competitionIds.length ? supabase.from("competitions").select("id,name,logo_url").in("id", competitionIds) : Promise.resolve({ data: [] }),
        playerIds.length ? supabase.from("players").select("id,name,photo_url,position,club_id").in("id", playerIds) : Promise.resolve({ data: [] }),
      ]);
      const players = Object.fromEntries((playersResult.data || []).map((player) => [player.id, player]));
      const currentClubIds = [...new Set((playersResult.data || []).map((player) => player.club_id).filter(Boolean))];
      const currentClubsResult = currentClubIds.length ? await supabase.from("clubs").select("id,name,logo_url").in("id", currentClubIds) : { data: [] };
      const currentClubs = Object.fromEntries((currentClubsResult.data || []).map((club) => [club.id, club]));
      const uniqueCallups = [...new Map(callups.map((callup) => [callup.player_id, callup])).values()];
      const clubMap = Object.fromEntries((clubsResult.data || []).map((club) => [club.id, club]));
      if (clubIds.length) {
        // Requête séparée et tolérante : si la migration 0029 n'est pas encore appliquée,
        // l'erreur « colonne inconnue » est ignorée et la page fonctionne sans le ranking.
        const { data: rankRows, error: rankError } = await supabase.from("clubs").select("id,fifa_ranking").in("id", clubIds);
        if (!rankError) for (const row of rankRows || []) { if (clubMap[row.id]) clubMap[row.id].fifa_ranking = row.fifa_ranking; }
      }
      setMatches(matchRows);
      const matchIds = matchRows.map((match) => match.id);
      if (matchIds.length) {
        // Tolérant tant que la migration votw/0004 n'est pas appliquée : la page
        // Diables reste entièrement fonctionnelle et le CTA est simplement absent.
        const { data: sessionRows, error: sessionError } = await supabase.from("votw_sessions")
          .select("id,match_id,status,opens_at,closes_at")
          .eq("kind", "pre_match").in("match_id", matchIds);
        if (!sessionError) setPreMatchSessions(sessionRows || []);
      }
      setClubs(clubMap);
      setCompetitions(Object.fromEntries((competitionsResult.data || []).map((competition) => [competition.id, competition])));
      setSquad(uniqueCallups.map((callup) => ({ ...callup, player: players[callup.player_id], club: currentClubs[players[callup.player_id]?.club_id] })).filter((row) => row.player));
      const latestFinished = [...matchRows].filter((match) => match.status === "finished").sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff))[0];
      if (latestFinished) {
        const { data: historicalCallups, error: historicalError } = await supabase.from("national_match_callups").select("*").eq("match_id", latestFinished.id).eq("national_team_id", selectedId);
        if (!historicalError && historicalCallups?.length) {
          const historicalIds = [...new Set(historicalCallups.map((row) => row.player_id).filter(Boolean))];
          const { data: historicalPlayers } = await supabase.from("players").select("id,name,photo_url,position,club_id").in("id", historicalIds);
          const historicalPlayerMap = Object.fromEntries((historicalPlayers || []).map((player) => [player.id, player]));
          const historicalClubIds = [...new Set((historicalPlayers || []).map((player) => player.club_id).filter(Boolean))];
          const { data: historicalClubs } = historicalClubIds.length ? await supabase.from("clubs").select("id,name,logo_url").in("id", historicalClubIds) : { data: [] };
          const historicalClubMap = Object.fromEntries((historicalClubs || []).map((club) => [club.id, club]));
          setRatingSquad(historicalCallups.map((callup) => ({ ...callup, player: historicalPlayerMap[callup.player_id], club: historicalClubMap[historicalPlayerMap[callup.player_id]?.club_id] })).filter((row) => row.player));
        }
      }
      setLoading(false);
    })().catch(() => { setSchemaMissing(true); setLoading(false); });
  }, [selectedId]);

  const selectedTeam = teams.find((team) => team.id === selectedId);
  const genders = [...new Set(teams.map((team) => team.national_gender || "men"))];
  const teamsForGender = teams.filter((team) => (team.national_gender || "men") === (selectedGender || "men"));
  const now = Date.now();
  const upcoming = matches.filter((match) => match.status === "live" || (match.status === "scheduled" && new Date(match.kickoff).getTime() >= now));
  const results = matches.filter((match) => match.status === "finished").sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
  const featured = upcoming[0] || results[0] || null;
  const preMatchSession = featured && ["scheduled", "live"].includes(featured.status)
    ? preMatchSessions.find((item) => item.match_id === featured.id && item.status === "open" && (!item.opens_at || new Date(item.opens_at).getTime() <= now) && (!item.closes_at || new Date(item.closes_at).getTime() > now))
    : null;
  const fifaRank = selectedTeam?.fifa_ranking || rankings.fifa.find((row) => row.isBelgium)?.rank || "—";
  const record = useMemo(() => {
    if (!selectedId) return { wins: 0, draws: 0, losses: 0, goals: 0 };
    return results.reduce((total, match) => {
      const home = match.home_club_id === selectedId;
      const mine = home ? match.home_score : match.away_score;
      const theirs = home ? match.away_score : match.home_score;
      total.goals += mine || 0;
      if (mine > theirs) total.wins++; else if (mine === theirs) total.draws++; else total.losses++;
      return total;
    }, { wins: 0, draws: 0, losses: 0, goals: 0 });
  }, [results, selectedId]);
  const sectionConfig = Object.fromEntries(config.sections.map((section) => [section.key, section]));
  const displayedResults = results.slice(0, 6);
  const otherUpcoming = upcoming.filter((match) => match.id !== featured?.id).slice(0, 2);

  if (schemaMissing) return <div className="mx-auto max-w-3xl rounded-3xl border border-amber-400/20 bg-amber-400/5 p-8 text-center"><Shield className="mx-auto h-10 w-10 text-amber-300" /><h1 className="mt-3 text-2xl font-black">Le module Sélections est prêt</h1><p className="mt-2 text-sm leading-6 text-muted">Il reste à appliquer la migration SQL 0027, puis à lancer « Synchroniser une sélection » dans l'administration.</p></div>;

  const heroStyle = { backgroundColor: config.hero.background_color, borderColor: config.hero.border_color };
  return <div className="space-y-8">
    <section className="relative overflow-hidden rounded-3xl border px-5 py-8 sm:px-8 sm:py-11" style={heroStyle}>
      {config.hero.image_url && <img src={config.hero.image_url} alt="" className="absolute inset-0 h-full w-full object-cover object-[72%_center] sm:object-center" />}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/20" style={{ opacity: config.hero.overlay }} />
      <div className="relative z-10 max-w-2xl"><div className="text-[11px] font-black uppercase tracking-[.25em]" style={{ color: config.hero.secondary_color }}>{config.hero.kicker}</div><h1 className="mt-3 text-4xl font-black uppercase leading-none sm:text-6xl">{selectedTeam?.national_category === "senior" || !selectedTeam ? config.hero.title : CATEGORY_LABELS[selectedTeam.national_category] || selectedTeam.name}</h1><p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">{config.hero.intro}</p>
        {genders.length > 1 && <div className="mt-5 inline-flex rounded-xl border border-white/15 bg-black/25 p-1">{genders.map((gender) => <button key={gender} onClick={() => { setSelectedGender(gender); const first = teams.find((team) => (team.national_gender || "men") === gender); if (first) setSelectedId(first.id); }} className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${(selectedGender || "men") === gender ? "bg-white text-black" : "text-slate-300 hover:text-white"}`}>{gender === "women" ? "Femmes" : "Hommes"}</button>)}</div>}
        <div className="mt-4 flex flex-wrap gap-2">{teamsForGender.map((team) => <button key={team.id} onClick={() => setSelectedId(team.id)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${selectedId === team.id ? "border-red-400/60 bg-red-500/20 text-white" : "border-white/15 bg-black/20 text-slate-300 hover:border-white/35"}`}>{team.logo_url && <img src={team.logo_url} className="h-5 w-5 object-contain" alt="" />}{CATEGORY_LABELS[team.national_category] || team.name}</button>)}</div>
      </div>
    </section>

    {loading ? <div className="h-72 animate-pulse rounded-3xl bg-surface" /> : teams.length === 0 ? <div className="rounded-3xl border border-dashed border-line/20 p-10 text-center"><div className="text-5xl">🇧🇪</div><h2 className="mt-4 text-xl font-black">Les sélections sont prêtes à être reliées</h2><p className="mt-2 text-sm text-muted">Lance la synchronisation ciblée depuis l’administration avec l’identifiant API-Football de la Belgique.</p></div> : <div className="grid items-start gap-4 lg:grid-cols-12">
      <div className="order-1 space-y-4 lg:col-span-8">
        <ModuleCard>
          <PanelHeader icon={CalendarDays} title={config.labels.featured} />
          <FeaturedMatch match={featured} clubs={clubs} competitions={competitions} />
        </ModuleCard>
        <div className="grid grid-cols-4 gap-2">
          {[[results.length, config.labels.stats_matches, "text-white"], [record.wins, config.labels.stats_wins, "text-emerald-400"], [record.goals, config.labels.stats_goals, "text-white"], [fifaRank, config.labels.stats_fifa, "text-amber-300"]].map(([value, label, color]) => <div key={label} className="rounded-2xl border border-line/10 bg-surface/60 px-2 py-4 text-center sm:py-5"><b className={`block text-xl sm:text-2xl ${color}`}>{value}</b><span className="mt-1 block text-[8px] font-bold uppercase tracking-wider text-muted sm:text-[9px]">{label}</span></div>)}
        </div>
      </div>

      <aside className="order-5 space-y-4 lg:order-2 lg:col-span-4">
        {rankings.fifa.length > 0 && <ModuleCard>
          <PanelHeader icon={Trophy} title={config.labels.fifa} />
          <div className="divide-y divide-line/10 overflow-hidden rounded-xl border border-line/10 bg-black/10">{rankings.fifa.map((row, index) => <div key={index} className={`flex items-center justify-between px-3 py-1.5 text-sm lg:py-2.5 ${row.isBelgium ? "bg-gradient-to-r from-red-500/20 to-amber-300/[0.06] font-black text-white" : "text-slate-300"}`}><span className="flex min-w-0 items-center gap-2.5"><span className={`inline-block w-5 shrink-0 text-center text-xs font-black tabular-nums ${Number(row.rank) <= 3 ? "text-amber-300" : "text-slate-500"}`}>{row.rank}</span><CountryFlag nation={row.nation} /><span className="truncate">{row.nation}</span></span><span className={`ml-2 w-[78px] shrink-0 text-right text-[11px] tabular-nums ${row.isBelgium ? "text-amber-200" : "text-muted"}`}>{row.points !== "" ? <>{row.points} <span className="text-[9px]">pts</span></> : "—"}</span></div>)}</div>
        </ModuleCard>}
        {selectedTeam?.national_category === "senior" && (selectedTeam?.national_gender || "men") === "men" && results[0] && ratingSquad.length > 0 && <DiableRatings match={results[0]} squad={ratingSquad} title={config.labels.ratings} showAllLabel={config.labels.show_all_players} showLessLabel={config.labels.show_less_players} compact />}
        {sectionConfig.schedule?.enabled && otherUpcoming.length > 0 && <ModuleCard>
          <PanelHeader icon={CalendarDays} title={sectionConfig.schedule.label} subtitle={sectionConfig.schedule.subtitle} accent={sectionConfig.schedule.accent} />
          <div className="space-y-3">{otherUpcoming.map((match) => <SmallMatch key={match.id} match={match} clubs={clubs} competitions={competitions} />)}</div>
        </ModuleCard>}
      </aside>

      {preMatchSession && <Link href={`/onze?match=${featured.id}`} className="group order-2 flex flex-col gap-4 overflow-hidden rounded-2xl border border-red-400/25 bg-gradient-to-r from-red-950/60 via-surface to-amber-950/25 p-5 transition hover:border-red-400/55 sm:flex-row sm:items-center lg:order-3 lg:col-span-12">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/10"><Star className="h-5 w-5 text-amber-300" /></div>
        <div className="min-w-0 flex-1"><div className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">Avant-match communautaire</div><h2 className="mt-1 text-lg font-black text-white">Compose ton 11 des Diables</h2><p className="mt-1 text-xs leading-5 text-muted">Choisis ta tactique et tes titulaires, puis partage ta composition avant le coup d’envoi.</p></div>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-black text-white">Faire mon 11 <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
      </Link>}

      {sectionConfig.results?.enabled && <ModuleCard className="order-3 lg:order-4 lg:col-span-12">
        <PanelHeader icon={Trophy} title={sectionConfig.results.label} subtitle={sectionConfig.results.subtitle} accent={sectionConfig.results.accent} action={results.length > 4 ? config.labels.show_all_results : null} actionHref={`/diables-rouges/matchs?equipe=${selectedId}`} />
        {results.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{displayedResults.map((match, index) => <SmallMatch key={match.id} match={match} clubs={clubs} competitions={competitions} className={index >= 4 ? "hidden sm:block" : "block"} />)}</div> : <p className="text-sm text-muted">Aucun résultat importé.</p>}
      </ModuleCard>}

      {sectionConfig.squad?.enabled && <ModuleCard className="order-4 lg:order-5 lg:col-span-12">
        <PanelHeader icon={Users} title={sectionConfig.squad.label} subtitle={sectionConfig.squad.subtitle} accent={sectionConfig.squad.accent} action={squad.length > 4 ? `${config.labels.show_all_players} (${squad.length})` : null} actionHref={`/diables-rouges/selection?equipe=${selectedId}`} />
        {squad.length ? <>
          <div className="sm:hidden"><SquadNamesPreview rows={squad} accent={sectionConfig.squad.accent} /></div>
          <SquadPreview rows={squad} accent={sectionConfig.squad.accent} className="hidden sm:grid" />
        </> : <p className="text-sm text-muted">La sélection apparaîtra après sa synchronisation.</p>}
      </ModuleCard>}
    </div>}
  </div>;
}
