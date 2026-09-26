"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Crown,
  Flame,
  Globe2,
  Newspaper,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import MatchRow from "@/components/football/MatchRow";
import LiveScoreRibbon from "@/components/football/LiveScoreRibbon";
import { competitionPath } from "@/lib/competitionRoutes";
import { useHomeConfig } from "@/lib/homeSections";
import { computeStandings } from "@/lib/standings";
import { supabase } from "@/lib/supabaseClient";
import { sortPublicSeasons } from "@/lib/publicSeasons";

const normal = (value) => String(value || "").trim().toLocaleLowerCase("fr");
const year = (value) => Number((String(value || "").match(/\d{4}/) || [0])[0]);
const isBelgian = (value) => normal(value).startsWith("belg");
const isEurope = (competition) => /(champions|europa|conference)/i.test(competition?.name || "");
const FOLLOWED_BELGIANS_SLIDE_ID = "followed-belgians";

function latestPlayerTotals(rows = []) {
  const latest = Math.max(0, ...rows.map((row) => year(row.season)));
  const selected = latest ? rows.filter((row) => year(row.season) === latest) : rows;
  const sum = (key) => selected.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const ratings = selected.map((row) => Number(row.rating)).filter((value) => value > 0);
  return {
    appearances: sum("appearances"),
    goals: sum("goals"),
    assists: sum("assists"),
    rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
  };
}

function SectionTitle({ section, href, icon: Icon }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />}
        <div>
          <h2 className="text-xl font-black sm:text-2xl">{section.label}</h2>
          {section.subtitle && <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted sm:text-sm">{section.subtitle}</p>}
        </div>
      </div>
      {href && section.action && <Link href={href} className="hidden shrink-0 items-center gap-1 rounded-lg border border-line/15 px-3 py-2 text-xs font-bold transition hover:border-accent/50 sm:flex">{section.action}<ArrowRight className="h-3.5 w-3.5" /></Link>}
    </div>
  );
}

function EmptyBlock({ children }) {
  return <div className="rounded-2xl border border-dashed border-line/15 bg-surface/40 p-6 text-center text-sm text-muted">{children}</div>;
}

function PlayerPhoto({ player, className = "h-14 w-14" }) {
  return player?.photo_url
    ? <img src={player.photo_url} className={`${className} shrink-0 rounded-2xl object-cover`} alt="" />
    : <span className={`${className} flex shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] font-black`}>{player?.name?.slice(0, 2)}</span>;
}

function HeroTitle({ value }) {
  const parts = String(value || "Les Belges. Partout dans le monde.").split(/(Partout)/i);
  return <>{parts.map((part, index) => /^partout$/i.test(part) ? <span key={index} className="text-amber-400">{part}</span> : part)}</>;
}

export default function Home() {
  const config = useHomeConfig();
  const [data, setData] = useState({ loading: true, matches: [], clubs: {}, competitions: [], seasons: [], players: [], stats: [], news: [], votwSessions: [], topics: [] });
  const [activeCompetitionId, setActiveCompetitionId] = useState("");

  useEffect(() => { (async () => {
    const [matchResult, clubResult, competitionResult, seasonResult, playerResult, statsResult, newsResult, votwResult, topicsResult] = await Promise.all([
      supabase.from("matches").select("*").order("kickoff", { ascending: false }).limit(500),
      supabase.from("clubs").select("id,name,logo_url"),
      supabase.from("competitions").select("*"),
      supabase.from("seasons").select("*"),
      supabase.from("players").select("*").eq("tracked", true).eq("active", true),
      supabase.from("player_season_stats").select("*"),
      supabase.from("entries").select("*").eq("collection", "news").eq("published", true).is("deleted_at", null).order("published_at", { ascending: false, nullsFirst: false }).limit(9),
      supabase.from("votw_sessions").select("id,matchday,season_label,formation,status,closes_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("forum_topics").select("id,title,author_name,last_activity").order("last_activity", { ascending: false }).limit(4),
    ]);
    setData({
      loading: false,
      matches: matchResult.data || [],
      clubs: Object.fromEntries((clubResult.data || []).map((club) => [club.id, club])),
      competitions: competitionResult.data || [],
      seasons: seasonResult.data || [],
      players: playerResult.data || [],
      stats: statsResult.data || [],
      news: newsResult.data || [],
      votwSessions: votwResult.data || [],
      topics: topicsResult.data || [],
    });
  })().catch(() => setData((current) => ({ ...current, loading: false }))); }, []);

  const view = useMemo(() => {
    const now = new Date();
    const chronological = [...data.matches].filter((match) => match.kickoff).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    const competitionMap = Object.fromEntries(data.competitions.map((competition) => [competition.id, competition]));
    const statMap = {};
    for (const row of data.stats) (statMap[row.player_id] ||= []).push(row);

    const players = data.players.filter((player) => isBelgian(player.nationality)).map((player) => {
      const rows = statMap[player.id] || [];
      const statsCompetition = rows.map((row) => competitionMap[row.competition_id]).find(Boolean);
      const country = player.country || statsCompetition?.ext?.country || "";
      const competition = player.competition || statsCompetition?.name || "Autres championnats";
      return { player, club: data.clubs[player.club_id], totals: latestPlayerTotals(rows), country, competition, competitionData: statsCompetition };
    }).filter((item) => item.club && !isBelgian(item.country) && !["jupiler pro league", "croky cup", "pro league"].includes(normal(item.competition))).sort((a, b) => (b.totals.goals + b.totals.assists) - (a.totals.goals + a.totals.assists) || (b.totals.rating || 0) - (a.totals.rating || 0));

    const byClub = new Map(players.map((item) => [item.player.club_id, item]));
    const watched = chronological.filter((match) => match.status !== "finished" && new Date(match.kickoff) >= now && (byClub.has(match.home_club_id) || byClub.has(match.away_club_id))).map((match) => ({ match, item: byClub.get(match.home_club_id) || byClub.get(match.away_club_id) })).slice(0, 5);

    const league = data.competitions.find((competition) => /(jupiler|pro league)/i.test(competition.name || "") && !/challenger/i.test(competition.name || "")) || data.competitions.find((competition) => !/cup|coupe/i.test(competition.name || ""));
    const leagueSeasons = sortPublicSeasons(data.seasons.filter((season) => season.competition_id === league?.id));
    const activeSeason = leagueSeasons[0];
    const leagueMatches = data.matches.filter((match) => match.competition_id === league?.id && (!activeSeason || !match.season_id || match.season_id === activeSeason.id));
    const phaseCounts = new Map();
    leagueMatches.forEach((match) => phaseCounts.set(match.phase || "—", (phaseCounts.get(match.phase || "—") || 0) + 1));
    const primaryPhase = [...phaseCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const primaryMatches = leagueMatches.filter((match) => (match.phase || "—") === primaryPhase);
    const standings = computeStandings(primaryMatches.filter((match) => match.status === "finished" && match.home_score != null && match.away_score != null));
    const leagueRecent = primaryMatches.filter((match) => match.status === "finished").sort((a, b) => new Date(b.kickoff || 0) - new Date(a.kickoff || 0)).slice(0, 5);
    const leagueUpcoming = primaryMatches.filter((match) => match.status !== "finished" && new Date(match.kickoff || 0) >= now).sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0)).slice(0, 5);

    const leagues = Object.values(players.reduce((groups, item) => {
      const key = item.competition || "Autres championnats";
      if (!groups[key]) groups[key] = { name: key, count: 0, logo: item.competitionData?.logo_url || "" };
      groups[key].count += 1;
      return groups;
    }, {})).sort((a, b) => b.count - a.count).slice(0, 7);

    const europeIds = new Set(data.competitions.filter(isEurope).map((competition) => competition.id));
    const europeMatches = chronological.filter((match) => europeIds.has(match.competition_id));
    const europe = [...europeMatches.filter((match) => match.status !== "finished" && new Date(match.kickoff) >= now), ...europeMatches.filter((match) => match.status === "finished").reverse()].slice(0, 5);
    return { players, watched, league, activeSeason, standings, leagueRecent, leagueUpcoming, leagues, europe };
  }, [data]);

  const sectionMap = Object.fromEntries(config.sections.map((section) => [section.key, section]));
  const heroPlayers = view.players.slice(0, 3);
  const featured = view.players[0];
  const followedClubIds = useMemo(() => [...new Set(data.players.map((player) => player.club_id).filter(Boolean))], [data.players]);
  const publicCompetitions = useMemo(() => data.competitions.filter((competition) => competition.public_visible !== false), [data.competitions]);
  const competitionSlides = useMemo(() => {
    const configuredIds = config.competition_carousel?.competition_ids || [];
    const featuredId = config.competition_carousel?.featured_competition_id || "";
    const allowedIds = new Set(configuredIds.length ? configuredIds : publicCompetitions.map((competition) => competition.id));
    if (featuredId) allowedIds.add(featuredId);
    const now = new Date();
    const slides = data.competitions.filter((competition) => allowedIds.has(competition.id)).map((competition) => {
      const activeSeason = sortPublicSeasons(data.seasons.filter((season) => season.competition_id === competition.id))[0];
      const matches = data.matches.filter((match) => match.competition_id === competition.id && (!activeSeason || !match.season_id || match.season_id === activeSeason.id));
      const phaseCounts = new Map();
      matches.forEach((match) => phaseCounts.set(match.phase || "—", (phaseCounts.get(match.phase || "—") || 0) + 1));
      const primaryPhase = [...phaseCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const primaryMatches = primaryPhase ? matches.filter((match) => (match.phase || "—") === primaryPhase) : matches;
      const finished = primaryMatches.filter((match) => match.status === "finished" && match.home_score != null && match.away_score != null);
      return {
        competition,
        href: competitionPath(competition),
        activeSeason,
        standings: computeStandings(finished),
        recent: finished.sort((a, b) => new Date(b.kickoff || 0) - new Date(a.kickoff || 0)).slice(0, 5),
        upcoming: primaryMatches.filter((match) => match.status !== "finished" && new Date(match.kickoff || 0) >= now).sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0)).slice(0, 5),
      };
    });
    if (allowedIds.has(FOLLOWED_BELGIANS_SLIDE_ID)) slides.push({
      competition: { id: FOLLOWED_BELGIANS_SLIDE_ID, name: "Matchs des Belges suivis", position: 998 },
      href: "/matchs",
      kind: "belgians",
      activeSeason: null,
      standings: [],
      recent: [],
      upcoming: view.watched.map(({ match }) => match).slice(0, 5),
      players: view.watched.map(({ item }) => item).filter((item, index, rows) => rows.findIndex((candidate) => candidate.player.id === item.player.id) === index).slice(0, 5),
    });
    return slides.sort((a, b) => {
      if (a.competition.id === featuredId) return -1;
      if (b.competition.id === featuredId) return 1;
      return (a.competition.position ?? 999) - (b.competition.position ?? 999) || a.competition.name.localeCompare(b.competition.name, "fr");
    });
  }, [config.competition_carousel, data.competitions, data.matches, data.seasons, publicCompetitions, view.watched]);
  useEffect(() => {
    const preferred = config.competition_carousel?.featured_competition_id;
    setActiveCompetitionId((current) => competitionSlides.some((slide) => slide.competition.id === current) ? current : (competitionSlides.find((slide) => slide.competition.id === preferred)?.competition.id || competitionSlides[0]?.competition.id || ""));
  }, [competitionSlides, config.competition_carousel?.featured_competition_id]);
  const activeCompetitionIndex = Math.max(0, competitionSlides.findIndex((slide) => slide.competition.id === activeCompetitionId));
  const activeCompetitionSlide = competitionSlides[activeCompetitionIndex];
  const moveCompetition = (direction) => {
    if (competitionSlides.length < 2) return;
    const nextIndex = (activeCompetitionIndex + direction + competitionSlides.length) % competitionSlides.length;
    setActiveCompetitionId(competitionSlides[nextIndex].competition.id);
  };

  const content = {
    live: <LiveScoreRibbon config={sectionMap.live} competitions={publicCompetitions} clubs={data.clubs} followedClubIds={followedClubIds} />,
    jpl: activeCompetitionSlide ? (
      <div className="overflow-hidden rounded-2xl border border-sky-400/20 bg-[linear-gradient(145deg,rgba(12,31,52,.96),rgba(5,18,34,.96))] shadow-[0_22px_60px_-45px_rgba(56,189,248,.65)]">
        <div className="border-b border-line/10 px-4 py-4 sm:px-5">
          {competitionSlides.length > 1 && <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">{competitionSlides.map((slide) => <button key={slide.competition.id} onClick={() => setActiveCompetitionId(slide.competition.id)} className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ${slide.competition.id === activeCompetitionSlide.competition.id ? "border-sky-300/60 bg-sky-400/15 text-sky-100" : "border-line/15 bg-white/[0.025] text-muted hover:text-content"}`}>{slide.competition.logo_url && <img src={slide.competition.logo_url} className="h-4 w-4 object-contain" alt="" />}{slide.competition.name}</button>)}</div>}
          <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {activeCompetitionSlide.competition.logo_url && <img src={activeCompetitionSlide.competition.logo_url} className="h-10 w-10 flex-shrink-0 object-contain sm:h-11 sm:w-11" alt="" />}
            <div className="min-w-0"><div className="truncate text-lg font-black sm:text-2xl">{activeCompetitionSlide.competition.name}</div><div className="truncate text-xs text-muted">{activeCompetitionSlide.kind === "belgians" ? "Les prochains rendez-vous de nos joueurs à l'étranger" : (activeCompetitionSlide.activeSeason?.label || sectionMap.jpl?.subtitle)}</div></div>
          </div>
          {competitionSlides.length > 1 && <div className="flex shrink-0 gap-1"><button onClick={() => moveCompetition(-1)} aria-label="Compétition précédente" className="rounded-lg border border-line/15 p-2 text-muted hover:text-content"><ChevronLeft className="h-4 w-4" /></button><button onClick={() => moveCompetition(1)} aria-label="Compétition suivante" className="rounded-lg border border-line/15 p-2 text-muted hover:text-content"><ChevronRight className="h-4 w-4" /></button></div>}
          <Link href={activeCompetitionSlide.href} className="hidden flex-shrink-0 items-center justify-center gap-1 rounded-lg border border-line/20 px-3 py-2 text-xs font-bold hover:border-accent/50 sm:inline-flex">{activeCompetitionSlide.kind === "belgians" ? "Voir les matchs" : sectionMap.jpl?.action}<ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
        <div className="grid lg:grid-cols-3">
          {activeCompetitionSlide.kind === "belgians" ? <div className="p-4"><div className="mb-3 text-sm font-black">À suivre cette semaine</div><p className="text-xs leading-5 text-muted">Une vue rapide des rencontres des clubs où évoluent les Belges suivis par Belfoot.</p><Link href="/belges-a-l-etranger" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-300">Voir les joueurs<ArrowRight className="h-3.5 w-3.5" /></Link></div> : <Link href={`${activeCompetitionSlide.href}?tab=classement`} className="p-4 transition hover:bg-white/[0.025]"><div className="mb-3 text-sm font-black">Classement <span className="text-muted">(Top 5)</span></div><div className="divide-y divide-line/10">{activeCompetitionSlide.standings.slice(0, 5).map((row, index) => <div key={row.club} className="flex items-center gap-2 py-2"><span className="w-5 text-center text-xs text-muted">{index + 1}</span>{data.clubs[row.club]?.logo_url && <img src={data.clubs[row.club].logo_url} className="h-5 w-5 object-contain" alt="" />}<span className="min-w-0 flex-1 truncate text-xs font-semibold">{data.clubs[row.club]?.name || "—"}</span><b className="text-xs">{row.pts}</b></div>)}{!activeCompetitionSlide.standings.length && <p className="py-2 text-xs text-muted">Classement non disponible pour ce format.</p>}</div></Link>}
          <div className="border-t border-line/10 p-4 lg:border-l lg:border-t-0">{activeCompetitionSlide.kind === "belgians" ? <><div className="mb-3 text-sm font-black">Belges concernés</div><div className="space-y-2">{activeCompetitionSlide.players.map((item) => <Link key={item.player.id} href={`/players/${item.player.id}`} className="flex items-center gap-2 rounded-lg p-1 transition hover:bg-white/[0.03]"><PlayerPhoto player={item.player} className="h-8 w-8 rounded-lg" /><span className="min-w-0"><span className="block truncate text-xs font-bold">{item.player.name}</span><span className="block truncate text-[10px] text-muted">{item.club?.name}</span></span></Link>)}{!activeCompetitionSlide.players.length && <p className="text-xs text-muted">Aucun joueur concerné pour le moment.</p>}</div></> : <><div className="mb-3 text-sm font-black">Derniers résultats</div><div className="space-y-1.5">{activeCompetitionSlide.recent.map((match) => <MatchRow key={match.id} m={match} clubs={data.clubs} href={`/matchs/${match.id}`} compact />)}{!activeCompetitionSlide.recent.length && <p className="text-xs text-muted">Aucun résultat disponible.</p>}</div></>}</div>
          <div className="border-t border-line/10 p-4 lg:border-l lg:border-t-0"><div className="mb-3 text-sm font-black">Prochains matchs</div><div className="space-y-1.5">{activeCompetitionSlide.upcoming.map((match) => <MatchRow key={match.id} m={match} clubs={data.clubs} href={`/matchs/${match.id}`} compact />)}{!activeCompetitionSlide.upcoming.length && <p className="text-xs text-muted">Aucun match programmé.</p>}</div><Link href={activeCompetitionSlide.href} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-sky-300 sm:hidden">{activeCompetitionSlide.kind === "belgians" ? "Voir les matchs" : sectionMap.jpl?.action}<ArrowRight className="h-3.5 w-3.5" /></Link></div>
        </div>
      </div>
    ) : <EmptyBlock>Les compétitions choisies dans l'administration apparaîtront ici.</EmptyBlock>,

    watch: view.watched.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{view.watched.map(({ match, item }) => { const home = data.clubs[match.home_club_id]; const away = data.clubs[match.away_club_id]; return <Link key={match.id} href={`/matchs/${match.id}`} className="group overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/60 p-3 transition hover:-translate-y-0.5 hover:border-amber-400/40"><div className="flex items-center justify-between text-[10px] text-muted"><b className="text-content">{new Date(match.kickoff).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}</b><span className="truncate pl-2">{item.competition}</span></div><div className="my-4 flex items-center justify-center gap-3">{home?.logo_url && <img src={home.logo_url} className="h-8 w-8 object-contain" alt="" />}<span className="text-xs text-muted">—</span>{away?.logo_url && <img src={away.logo_url} className="h-8 w-8 object-contain" alt="" />}</div><div className="flex items-center gap-2 border-t border-line/10 pt-3"><PlayerPhoto player={item.player} className="h-10 w-10" /><div className="min-w-0"><div className="truncate text-xs font-black group-hover:text-amber-300">{item.player.name}</div><div className="truncate text-[10px] text-muted">{item.club?.name}</div></div></div></Link>; })}</div> : view.players.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{view.players.slice(0, 5).map((item) => <Link key={item.player.id} href={`/players/${item.player.id}`} className="flex items-center gap-3 rounded-2xl border border-line/10 bg-surface p-3 transition hover:border-amber-400/40"><PlayerPhoto player={item.player} className="h-12 w-12" /><div className="min-w-0"><div className="truncate text-sm font-black">{item.player.name}</div><div className="truncate text-xs text-muted">{item.club?.name}</div><div className="mt-1 text-[10px] text-amber-300">Prochain match à alimenter</div></div></Link>)}</div> : <EmptyBlock>Les joueurs suivis et leurs prochains matchs apparaîtront ici.</EmptyBlock>,

    form: view.players.length ? <div className="space-y-3">{featured && <Link href={`/players/${featured.player.id}`} className="flex items-center gap-3 overflow-hidden rounded-2xl border border-violet-400/30 bg-gradient-to-r from-violet-950/80 via-surface to-bg p-3 transition hover:border-violet-300/50 sm:p-4"><PlayerPhoto player={featured.player} className="h-16 w-16 sm:h-20 sm:w-20" /><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.14em] text-amber-300"><Crown className="h-4 w-4" />Le Belge du moment</div><div className="mt-1 truncate text-base font-black sm:text-lg">{featured.player.name}</div><div className="truncate text-xs text-muted">{featured.club?.name}</div></div><div className="shrink-0 text-right text-xs text-muted"><div><b className="text-lg text-content">{featured.totals.goals}</b> buts</div><div><b className="text-content">{featured.totals.assists}</b> passes</div></div></Link>}<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{view.players.slice(1, 5).map((item) => <Link key={item.player.id} href={`/players/${item.player.id}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-line/10 bg-gradient-to-b from-surface to-bg/50 p-2.5 transition hover:border-orange-400/40 sm:p-3"><PlayerPhoto player={item.player} className="h-11 w-11 rounded-xl sm:h-14 sm:w-14" /><div className="min-w-0 flex-1"><div className="truncate text-xs font-black sm:text-sm">{item.player.name}</div><div className="truncate text-[10px] text-muted">{item.club?.name}</div><div className="mt-1 text-[10px] text-muted"><b className="text-sm text-content">{item.totals.goals}</b> buts{item.totals.assists > 0 ? ` · ${item.totals.assists} pd` : ""}</div></div></Link>)}</div></div> : <EmptyBlock>Les statistiques des joueurs suivis alimenteront ce bloc.</EmptyBlock>,

    leagues: view.leagues.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{view.leagues.map((league, index) => <Link key={league.name} href="/belges-a-l-etranger" className="rounded-2xl border border-line/10 bg-gradient-to-br from-surface to-bg/50 p-3 transition hover:-translate-y-0.5 hover:border-sky-400/40">{league.logo ? <img src={league.logo} className="h-8 w-8 object-contain" alt="" /> : <Globe2 className={`h-7 w-7 ${index % 2 ? "text-violet-400" : "text-sky-400"}`} />}<div className="mt-3 truncate text-xs font-black">{league.name}</div><div className="mt-1 text-xl font-black">{league.count}</div><div className="text-[10px] text-muted">Belge{league.count > 1 ? "s" : ""} suivi{league.count > 1 ? "s" : ""}</div></Link>)}</div> : <EmptyBlock>Les championnats étrangers suivis apparaîtront automatiquement ici.</EmptyBlock>,

    news: data.news.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.news.slice(0, 3).map((item) => <Link key={item.id} href={`/actus/${item.slug}`} className="group overflow-hidden rounded-2xl border border-line/10 bg-surface transition hover:border-sky-400/40">{item.cover_url ? <img src={item.cover_url} className="aspect-[16/9] w-full object-cover transition duration-300 group-hover:scale-[1.02]" alt="" /> : <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-sky-400/15 to-surface2"><Newspaper className="h-8 w-8 text-sky-400/60" /></div>}<div className="p-4">{item.category && <div className="text-[10px] font-black uppercase tracking-wider text-sky-300">{item.category}</div>}<h3 className="mt-1 line-clamp-2 font-black leading-snug">{item.title}</h3>{item.excerpt && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{item.excerpt}</p>}</div></Link>)}</div> : <EmptyBlock>Les articles publiés dans l'administration s'afficheront automatiquement ici.</EmptyBlock>,

    brief: data.news.length > 3 ? <div className="divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/10 bg-surface/60">{data.news.slice(3, 9).map((item, index) => <Link key={item.id} href={`/actus/${item.slug}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.025]"><span className={`h-2 w-2 shrink-0 rounded-full ${index % 3 === 0 ? "bg-emerald-400" : index % 3 === 1 ? "bg-pink-500" : "bg-sky-400"}`} /><span className="min-w-0 flex-1 text-sm font-semibold">{item.title}</span>{item.published_at && <time className="hidden shrink-0 text-[11px] text-muted sm:block">{new Date(item.published_at).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}</time>}<ChevronRight className="h-4 w-4 shrink-0 text-muted/50" /></Link>)}</div> : <EmptyBlock>Les brèves supplémentaires apparaîtront ici.</EmptyBlock>,

    europe: view.europe.length ? <div className="space-y-2">{view.europe.map((match) => <MatchRow key={match.id} m={match} clubs={data.clubs} href={`/matchs/${match.id}`} />)}</div> : <EmptyBlock>Ce bloc peut rester masqué tant que les compétitions européennes ne sont pas alimentées.</EmptyBlock>,

    noyau: (() => {
      const sessions = data.votwSessions || [];
      const openSess = sessions.find((s) => s.status === "open") || null;
      const lastPublished = sessions.find((s) => s.status === "published") || null;
      const topics = data.topics || [];
      const votw = openSess || lastPublished;
      if (!votw && !topics.length) return <EmptyBlock>Le vote du 11 de la semaine et les discussions du Noyau apparaîtront ici.</EmptyBlock>;
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {votw && (
            <Link href="/onze" className="flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 transition hover:border-amber-400/50">
              <Star className="h-8 w-8 flex-shrink-0 text-amber-300" />
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-wider text-amber-300">{openSess ? "Vote en cours" : "Onze des lecteurs"}</div>
                <div className="truncate text-sm font-bold">11 de la semaine — Journée {votw.matchday}</div>
                <div className="text-xs text-muted">{openSess ? "Compose ton XI →" : "Découvre le XI élu →"}</div>
              </div>
            </Link>
          )}
          <div className="rounded-2xl border border-line/10 bg-surface p-4">
            <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-muted">Discussions récentes</div>
            <div className="space-y-1.5">
              {topics.slice(0, 3).map((t) => (
                <Link key={t.id} href={`/forum/${t.id}`} className="block truncate text-sm hover:text-accent"><span className="font-semibold">{t.title}</span> <span className="text-xs text-muted">· {t.author_name || "Membre"}</span></Link>
              ))}
              {topics.length === 0 && <p className="text-xs text-muted">Lance la première discussion dans Le Noyau.</p>}
            </div>
          </div>
        </div>
      );
    })(),
  };

  const meta = {
    jpl: { href: view.league ? competitionPath(view.league) : "/competitions", icon: Trophy },
    noyau: { href: "/forum", icon: Star },
    watch: { href: "/matchs", icon: CalendarDays },
    form: { href: "/belges-a-l-etranger", icon: Flame },
    leagues: { href: "/belges-a-l-etranger", icon: Globe2 },
    news: { href: "/actus", icon: Newspaper },
    brief: { href: null, icon: Sparkles },
    europe: { href: "/matchs", icon: Trophy },
  };

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-[480px] bg-[radial-gradient(circle_at_70%_0%,rgba(30,64,175,.22),transparent_60%)]" />
      <section className="relative mb-8 overflow-hidden rounded-3xl border border-sky-400/15 bg-[linear-gradient(115deg,rgba(5,19,36,.98),rgba(8,28,49,.94),rgba(4,15,29,.98))] px-5 py-8 shadow-[0_30px_90px_-55px_rgba(56,189,248,.7)] sm:min-h-[390px] sm:px-9 sm:py-12">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:38px_38px]" />
        {config.hero.image_url ? <img src={config.hero.image_url} className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[58%] object-cover object-center opacity-90 [mask-image:linear-gradient(to_right,transparent,black_28%)] sm:block" alt="" /> : <div className="pointer-events-none absolute bottom-0 right-3 hidden h-[90%] w-[52%] sm:block">{heroPlayers.filter((item) => item.player.photo_url).map((item, index) => <img key={item.player.id} src={item.player.photo_url} className="absolute bottom-0 h-[72%] w-[42%] rounded-t-[5rem] object-cover object-top opacity-90 shadow-2xl" style={{ left: `${index * 28}%`, zIndex: 3 - index, transform: `translateY(${index === 1 ? 0 : 24}px)` }} alt="" />)}</div>}
        <div className="relative z-10 max-w-2xl"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-sky-300"><Sparkles className="h-3.5 w-3.5" />{config.hero.kicker}</div><h1 className="mt-4 max-w-xl whitespace-pre-line text-4xl font-black uppercase leading-[.98] sm:text-6xl"><HeroTitle value={config.hero.title} /></h1><p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">{config.hero.subtitle}</p><div className="mt-6 flex flex-wrap gap-2">{config.hero.primary_label && config.hero.primary_url && <Link href={config.hero.primary_url} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:brightness-110">{config.hero.primary_label}<ArrowRight className="h-4 w-4" /></Link>}{config.hero.secondary_label && config.hero.secondary_url && <Link href={config.hero.secondary_url} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.035] px-4 py-2.5 text-sm font-bold transition hover:border-sky-300/50">{config.hero.secondary_label}</Link>}</div><div className="mt-7 flex max-w-md divide-x divide-white/10"><div className="pr-5"><b className="text-2xl text-amber-300">{view.players.length}</b><span className="block text-[10px] text-slate-400">Belges suivis</span></div><div className="px-5"><b className="text-2xl">{view.leagues.length}</b><span className="block text-[10px] text-slate-400">Championnats couverts</span></div><div className="pl-5"><b className="text-2xl">1</b><span className="block text-[10px] text-slate-400">Passion commune 🇧🇪</span></div></div></div>
      </section>

      {data.loading ? <div className="grid gap-4 sm:grid-cols-2"><div className="h-48 animate-pulse rounded-2xl bg-surface" /><div className="h-48 animate-pulse rounded-2xl bg-surface" /></div> : <div className="space-y-9">{config.sections.filter((section) => section.enabled).map((section) => section.key === "live" ? <Fragment key={section.key}>{content.live}</Fragment> : section.key === "jpl" ? <section key={section.key}>{content.jpl}</section> : <section key={section.key}><SectionTitle section={section} href={meta[section.key]?.href} icon={meta[section.key]?.icon} />{content[section.key]}</section>)}</div>}
    </div>
  );
}
