"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronRight, Clock3, Flame, Globe2, MapPin, Search, Sparkles, Trophy, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useBelgiansAbroadConfig } from "@/lib/belgiansAbroad";
import { isNationalSelectionClub, nationalityBadges, ratingTone } from "@/lib/nationalities";
import { belgianWatchStatus, isBelgianFollowed } from "@/lib/playerIdentity";
import { clubNationalLeagues, resolvePlayerCountry, resolvePlayerLeague } from "@/lib/playerSnapshot";
import { PUBLIC_MATCH_FIELDS, PUBLIC_MATCH_PLAYER_STATS_FIELDS, PUBLIC_PLAYER_FIELDS, loadMatchesByIds, loadPlayerStatsForPlayers } from "@/lib/publicFootballData";
import { supabase } from "@/lib/supabaseClient";
import dynamic from "next/dynamic";
const BelgiansWorldMap = dynamic(() => import("@/components/football/BelgiansWorldMap"), { ssr: false, loading: () => <div className="rounded-2xl border border-line/10 bg-surface/60 p-8 text-center text-sm text-muted">Chargement de la carte…</div> });

const FLAGS = { England: "🏴", France: "🇫🇷", Germany: "🇩🇪", Italy: "🇮🇹", Spain: "🇪🇸", Netherlands: "🇳🇱", Portugal: "🇵🇹", Scotland: "🏴", Turkey: "🇹🇷", Austria: "🇦🇹", Switzerland: "🇨🇭", Greece: "🇬🇷", USA: "🇺🇸", Belgium: "🇧🇪" };
const POSITIONS = { Goalkeeper: "Gardien", GK: "Gardien", Defender: "Défenseur", DEF: "Défenseur", Midfielder: "Milieu", MID: "Milieu", Attacker: "Attaquant", FWD: "Attaquant" };
const SECTION_ICONS = { today: CalendarDays, form: Flame, leagues: Globe2, recap: Clock3, players: Users };
const SECTION_LINKS = { today: "/direct", form: "#all-players", recap: "/matchs" };
const normal = (value) => String(value || "").trim().toLocaleLowerCase("fr");
const isBelgian = (value) => normal(value).startsWith("belg");
const isBelgianClub = (club) => isBelgian(club?.ext?.country) || isBelgian(club?.ext?.team?.country);
const year = (value) => Number((String(value || "").match(/\d{4}/) || [0])[0]);
const safeColor = (value, fallback = "#e30613") => /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
const safeOverlay = (value, fallback = 0.42) => Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : fallback;
const countryFlag = (country) => nationalityBadges(country)[0]?.flag || FLAGS[country] || "🌍";

function latestTotals(rows = []) {
  const latest = Math.max(0, ...rows.map((row) => year(row.season)));
  const selected = latest ? rows.filter((row) => year(row.season) === latest) : rows;
  const sum = (key) => selected.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const ratings = selected.filter((row) => Number(row.rating) > 0).map((row) => Number(row.rating));
  return { season: latest || "—", appearances: sum("appearances"), minutes: sum("minutes"), goals: sum("goals"), assists: sum("assists"), rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null };
}

function PlayerPhoto({ player, className = "h-16 w-16" }) {
  const initials = player?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "BF";
  // Les photos API peuvent expirer ou être absentes. Le monogramme reste donc
  // toujours sous l'image : le bloc « Belge du moment » ne casse jamais.
  return <span className={`${className} relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/[0.06] text-lg font-black ring-1 ring-white/10`}>
    <span aria-hidden="true">{initials}</span>
    {player?.photo_url && <img src={player.photo_url} className="absolute inset-0 h-full w-full object-cover" alt="" onError={(event) => { event.currentTarget.remove(); }} />}
  </span>;
}

function SectionHeader({ section }) {
  const Icon = SECTION_ICONS[section.key] || Sparkles;
  const accent = safeColor(section.accent);
  const href = SECTION_LINKS[section.key];
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-2.5"><Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} /><div><h2 className="text-xl font-black sm:text-2xl">{section.label}</h2>{section.subtitle && <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted sm:text-sm">{section.subtitle}</p>}</div></div>
      {href && section.action && <Link href={href} className="hidden shrink-0 items-center gap-1 rounded-lg border border-line/15 px-3 py-2 text-xs font-bold transition hover:border-accent/50 sm:flex">{section.action}<ArrowRight className="h-3.5 w-3.5" /></Link>}
    </div>
  );
}

function EmptyBlock({ children }) {
  return <div className="rounded-2xl border border-dashed border-line/15 bg-surface/40 p-6 text-center text-sm leading-6 text-muted">{children}</div>;
}

function RatingPills({ ratings = [] }) {
  return <div className="flex justify-center gap-1" aria-label="Dernières notes">{ratings.length ? ratings.slice(0, 5).map((rating, index) => <span key={`${rating}-${index}`} title={rating.toFixed(1)} className={`h-2.5 w-2.5 rounded-full ${rating >= 7 ? "bg-emerald-400" : rating >= 6 ? "bg-amber-300" : "bg-red-400"}`} />) : <span className="text-[10px] text-muted">Pas encore de note récente</span>}</div>;
}

function FeaturedPlayer({ item }) {
  if (!item) return null;
  return <Link href={`/players/${item.player.id}`} className="group flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-gradient-to-r from-amber-300/[0.12] via-surface to-surface p-3.5 transition hover:border-amber-300/60 sm:gap-4 sm:p-4"><PlayerPhoto player={item.player} className="h-16 w-16 rounded-2xl sm:h-20 sm:w-20" /><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.15em] text-amber-200"><Trophy className="h-3.5 w-3.5" /> Belge du moment</div><h2 className="mt-0.5 truncate text-xl font-black sm:text-2xl">{item.player.name}</h2><div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-300">{item.club?.logo_url && <img src={item.club.logo_url} className="h-4 w-4 object-contain" alt="" />}<span className="truncate">{item.club?.name || "Club à renseigner"}</span><span className="text-slate-500">·</span><span className="truncate">{countryFlag(item.country)} {item.competition}</span></div></div><div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1 text-right text-[10px] text-muted sm:grid-cols-4 sm:text-center"><span><b className="block text-base text-content">{item.totals.appearances}</b>matchs</span><span><b className="block text-base text-content">{item.goals}</b>buts</span><span><b className="block text-base text-content">{item.assists}</b>passes</span><span className={item.rating ? ratingTone(item.rating) : ""}><b className="block text-base">{item.rating?.toFixed(1) || "—"}</b>note</span></div><ChevronRight className="hidden h-5 w-5 shrink-0 text-amber-200 transition group-hover:translate-x-1 sm:block" /></Link>;
}

export default function BelgiansAbroadPage() {
  const config = useBelgiansAbroadConfig();
  const [data, setData] = useState({ players: [], clubs: {}, competitions: {}, stats: {}, matches: [], performances: [], loading: true, error: "" });
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const [competition, setCompetition] = useState("all");
  const [position, setPosition] = useState("all");
  const [profile, setProfile] = useState("all");

  useEffect(() => { (async () => {
    const [playerResult, competitionResult] = await Promise.all([
      supabase.from("players").select(`${PUBLIC_PLAYER_FIELDS},binational_watch:ext->binational_watch`).eq("tracked", true).eq("active", true),
      supabase.from("competitions").select("*"),
    ]);
    if (playerResult.error) throw playerResult.error;
    if (competitionResult.error) throw competitionResult.error;
    // Nationalité belge parmi d'autres (« Maroc, Belgique ») ou binational classé à suivre.
    const players = (playerResult.data || []).filter(isBelgianFollowed);
    const playerIds = players.map((player) => player.id);
    const [statsRows, performanceResult] = await Promise.all([
      loadPlayerStatsForPlayers(supabase, playerIds),
      playerIds.length ? supabase.from("match_player_stats").select(PUBLIC_MATCH_PLAYER_STATS_FIELDS).in("player_id", playerIds).order("synced_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
    ]);
    if (performanceResult.error) throw performanceResult.error;
    const followedTeamIds = [...new Set(players.flatMap((player) => [player.club_id, player.national_team_id]).filter(Boolean))];
    const upcomingResult = followedTeamIds.length ? await supabase.from("matches").select(PUBLIC_MATCH_FIELDS).or(`home_club_id.in.(${followedTeamIds.join(",")}),away_club_id.in.(${followedTeamIds.join(",")})`).neq("status", "finished").gte("kickoff", new Date().toISOString()).order("kickoff", { ascending: true }).limit(100) : { data: [] };
    if (upcomingResult.error) throw upcomingResult.error;
    const performanceMatches = await loadMatchesByIds(supabase, (performanceResult.data || []).map((row) => row.match_id));
    const matchMap = new Map([...(upcomingResult.data || []), ...performanceMatches].map((match) => [match.id, match]));
    // Charger UNIQUEMENT les clubs référencés (joueurs + sélections + adversaires des
    // matchs + clubs des stats), par paquets → fini les « Club à renseigner » dus au
    // plafond de 1000 clubs, et ça reste rapide quel que soit le total en base.
    const clubIdSet = new Set(followedTeamIds);
    for (const match of matchMap.values()) { if (match.home_club_id) clubIdSet.add(match.home_club_id); if (match.away_club_id) clubIdSet.add(match.away_club_id); }
    for (const row of statsRows) { if (row.club_id) clubIdSet.add(row.club_id); }
    const clubList = [];
    const clubIdArr = [...clubIdSet].filter(Boolean);
    for (let i = 0; i < clubIdArr.length; i += 400) {
      const { data } = await supabase.from("clubs").select("id,name,logo_url,team_type,ext").in("id", clubIdArr.slice(i, i + 400));
      if (data) clubList.push(...data);
    }
    const stats = {};
    for (const row of statsRows) (stats[row.player_id] ||= []).push(row);
    setData({
      players,
      clubs: Object.fromEntries(clubList.map((item) => [item.id, item])),
      competitions: Object.fromEntries((competitionResult.data || []).map((item) => [item.id, item])),
      stats,
      matches: [...matchMap.values()],
      performances: performanceResult.data || [],
      loading: false,
      error: "",
    });
  })().catch((error) => setData((current) => ({ ...current, loading: false, error: error.message || String(error) }))); }, []);

  const view = useMemo(() => {
    // Championnat national connu de chaque club, d'après toutes les lignes chargées.
    const clubLeagues = clubNationalLeagues(Object.values(data.stats).flat(), data.competitions);
    const enriched = data.players.map((player) => {
      const club = data.clubs[player.club_id];
      // La fiche étrangère reste un bilan de club : les lignes de sélection
      // appartiennent au parcours international de la fiche joueur.
      const playerStats = (data.stats[player.id] || []).filter((row) => !isNationalSelectionClub(data.clubs[row.club_id], player.nationality));
      const domesticBelgianClub = playerStats.some((row) => row.club_id === player.club_id && isBelgian(data.competitions[row.competition_id]?.ext?.country));
      // Championnat et pays : statistiques du club actuel, puis championnat du club,
      // puis instantané s'il est valide — jamais « World » ni une coupe d'Europe.
      const league = resolvePlayerLeague({ player, statRows: playerStats, competitionsById: data.competitions, clubLeagues });
      const resolvedCountry = resolvePlayerCountry({ player, club, league: league.competition }) || "À renseigner";
      const resolvedCompetition = league.name || "Championnat à renseigner";
      return { player, club, nationalTeam: data.clubs[player.national_team_id], watch: belgianWatchStatus(player, data.clubs[player.national_team_id]), country: resolvedCountry, competition: resolvedCompetition, competitionData: league.competition, totals: latestTotals(playerStats), domesticBelgianClub };
    }).filter((item) => item.club && item.club.team_type !== "national" && !item.domesticBelgianClub && !isBelgianClub(item.club) && !isBelgian(item.country));

    const playerMap = Object.fromEntries(enriched.map((item) => [item.player.id, item]));
    const matchMap = Object.fromEntries(data.matches.map((match) => [match.id, match]));
    const now = new Date();
    const concernsPlayer = (item, match) => [item.player.club_id, item.player.national_team_id].filter(Boolean).some((teamId) => teamId === match.home_club_id || teamId === match.away_club_id);
    const watched = data.matches.filter((match) => match.kickoff && match.status !== "finished" && new Date(match.kickoff) >= now && enriched.some((item) => concernsPlayer(item, match))).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)).slice(0, 6).map((match) => ({ match, players: enriched.filter((item) => concernsPlayer(item, match)) }));

    const performances = data.performances.map((performance) => ({ performance, item: playerMap[performance.player_id], match: matchMap[performance.match_id] })).filter((row) => row.item && row.match?.kickoff).sort((a, b) => new Date(b.match.kickoff) - new Date(a.match.kickoff));
    const byPlayer = {};
    for (const row of performances) if ((byPlayer[row.item.player.id] ||= []).length < 5) byPlayer[row.item.player.id].push(row);
    const form = enriched.map((item) => {
      const recent = byPlayer[item.player.id] || [];
      const goals = recent.reduce((sum, row) => sum + (Number(row.performance.goals) || 0), 0);
      const assists = recent.reduce((sum, row) => sum + (Number(row.performance.assists) || 0), 0);
      const ratings = recent.map((row) => Number(row.performance.rating)).filter((value) => value > 0);
      const rating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : item.totals.rating;
      return { ...item, recent, ratings, recentCount: recent.length, goals: recent.length ? goals : item.totals.goals, assists: recent.length ? assists : item.totals.assists, rating, score: goals * 4 + assists * 3 + (rating || 0) + (recent.length ? recent.length : item.totals.appearances / 10) };
    }).sort((a, b) => b.score - a.score || a.player.name.localeCompare(b.player.name, "fr"));

    const leagues = Object.values(enriched.reduce((groups, item) => {
      const key = item.competition || "Autres championnats";
      if (!groups[key]) groups[key] = { name: key, country: item.country, logo: item.competitionData?.logo_url || "", count: 0 };
      groups[key].count += 1;
      return groups;
    }, {})).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));

    const featured = enriched.find((item) => item.player.id === config.hero.featured_player_id) || form[0] || enriched[0];
    return { enriched, watched, performances: performances.slice(0, 8), form, leagues, featured };
  }, [data, config.hero.featured_player_id]);

  const countries = [...new Set(view.enriched.map((item) => item.country))].sort((a, b) => a.localeCompare(b, "fr"));
  const competitionNames = [...new Set(view.enriched.map((item) => item.competition))].sort((a, b) => a.localeCompare(b, "fr"));
  const shown = view.enriched.filter((item) => {
    const matchesQuery = !query.trim() || normal(item.player.name).includes(normal(query)) || normal(item.club?.name).includes(normal(query));
    return matchesQuery && (country === "all" || item.country === country) && (competition === "all" || item.competition === competition) && (position === "all" || (POSITIONS[item.player.position] || item.player.position) === position) && (profile === "all" || (profile === "binational" ? item.watch === "binational" : item.watch !== "binational"));
  }).sort((a, b) => (b.totals.goals + b.totals.assists) - (a.totals.goals + a.totals.assists) || a.player.name.localeCompare(b.player.name, "fr"));
  const clubCount = new Set(view.enriched.map((item) => item.club?.id).filter(Boolean)).size;
  const heroStyle = config.hero.image_url ? { backgroundImage: `url(${config.hero.image_url})` } : undefined;
  const formItems = view.form.filter((item) => item.player.id !== view.featured?.player.id).slice(0, 4);

  const selectLeague = (name) => {
    setCompetition(name);
    setTimeout(() => document.getElementById("all-players")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const content = {
    today: view.watched.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{view.watched.map(({ match, players }) => { const home = data.clubs[match.home_club_id]; const away = data.clubs[match.away_club_id]; const international = home?.team_type === "national" || away?.team_type === "national"; const names = players.slice(0, 2).map((item) => item.player.name).join(" · "); const remaining = Math.max(0, players.length - 2); return <Link key={match.id} href={`/matchs/${match.id}`} className="group overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-br from-surface to-bg/60 p-4 transition hover:-translate-y-0.5 hover:border-amber-400/40"><div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted"><span>{new Date(match.kickoff).toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "short" })}</span><span className="rounded-full border border-line/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-bold text-slate-300">{international ? "Sélections" : "Club"}</span><b className="text-content">{new Date(match.kickoff).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}</b></div><div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><div>{home?.logo_url && <img src={home.logo_url} className="mx-auto h-10 w-10 object-contain" alt="" />}<div className="mt-2 truncate text-xs font-bold">{home?.name || "—"}</div></div><span className="text-xs text-muted">VS</span><div>{away?.logo_url && <img src={away.logo_url} className="mx-auto h-10 w-10 object-contain" alt="" />}<div className="mt-2 truncate text-xs font-bold">{away?.name || "—"}</div></div></div><div className="flex min-h-12 items-center gap-3 border-t border-line/10 pt-3"><div className="flex shrink-0 -space-x-2">{players.slice(0, 3).map((item) => <PlayerPhoto key={item.player.id} player={item.player} className="h-9 w-9 rounded-full ring-2 ring-surface" />)}{players.length > 3 && <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface2 text-[10px] font-black ring-2 ring-surface">+{players.length - 3}</span>}</div><div className="min-w-0"><div className="truncate text-xs font-black text-amber-300">{names}{remaining ? ` + ${remaining}` : ""}</div><div className="mt-0.5 text-[10px] text-muted">{players.length} joueur{players.length > 1 ? "s" : ""} suivi{players.length > 1 ? "s" : ""}</div></div></div></Link>; })}</div> : <EmptyBlock>Les prochains matchs apparaîtront ici dès qu'une compétition étrangère synchronisée concerne un joueur suivi.</EmptyBlock>,

    form: formItems.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{formItems.map((item) => <Link key={item.player.id} href={`/players/${item.player.id}`} className="group overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/60 p-3 text-center transition hover:-translate-y-0.5 hover:border-orange-400/40"><PlayerPhoto player={item.player} className="mx-auto h-14 w-14" /><div className="mt-2 truncate text-sm font-black group-hover:text-orange-300">{item.player.name}</div><div className="truncate text-[10px] text-muted">{item.club?.name || "Club à renseigner"}</div><div className="mt-3 flex justify-center gap-3 text-xs"><span><b className="block text-base">{item.goals}</b>buts</span><span><b className="block text-base">{item.assists}</b>passes</span>{item.rating && <span><b className={`block rounded-md px-1.5 py-0.5 ${ratingTone(item.rating)}`}>{item.rating.toFixed(1)}</b>note</span>}</div><div className="mt-2"><RatingPills ratings={item.ratings} /></div></Link>)}</div> : <EmptyBlock>Les statistiques existantes alimenteront automatiquement ce classement de forme.</EmptyBlock>,

    leagues: view.leagues.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{view.leagues.map((league, index) => <button key={league.name} onClick={() => selectLeague(league.name)} className="group rounded-2xl border border-line/10 bg-gradient-to-br from-surface to-bg/50 p-3.5 text-left transition hover:-translate-y-0.5 hover:border-sky-400/40">{league.logo ? <img src={league.logo} className="h-8 w-8 object-contain" alt="" /> : <Globe2 className={`h-7 w-7 ${index % 2 ? "text-violet-400" : "text-sky-400"}`} />}<div className="mt-3 truncate text-sm font-black">{league.name}</div><div className="mt-1 truncate text-[11px] text-muted">{countryFlag(league.country)} {league.country}</div><div className="mt-2 text-lg font-black">{league.count}<span className="ml-1 text-[10px] font-normal text-muted">Belge{league.count > 1 ? "s" : ""} suivi{league.count > 1 ? "s" : ""}</span></div></button>)}</div> : <EmptyBlock>Les championnats apparaîtront ici dès que le pays et la compétition des joueurs suivis seront renseignés.</EmptyBlock>,

    recap: view.performances.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{view.performances.map(({ performance, item, match }) => { const opponentId = item.player.club_id === match.home_club_id ? match.away_club_id : match.home_club_id; const opponent = data.clubs[opponentId]; return <Link key={performance.id} href={`/matchs/${match.id}`} className="rounded-2xl border border-line/10 bg-surface/70 p-4 transition hover:border-violet-400/40"><div className="flex items-center gap-3"><PlayerPhoto player={item.player} className="h-12 w-12" /><div className="min-w-0"><div className="truncate text-sm font-black">{item.player.name}</div><div className="truncate text-[10px] text-muted">vs {opponent?.name || "adversaire"} · {new Date(match.kickoff).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}</div></div>{performance.rating && <b className="ml-auto rounded-lg bg-violet-400/15 px-2 py-1 text-sm text-violet-300">{Number(performance.rating).toFixed(1)}</b>}</div><div className="mt-3 flex gap-3 border-t border-line/10 pt-3 text-[11px] text-muted"><span><b className="text-content">{performance.minutes || 0}</b> min</span><span><b className="text-content">{performance.goals || 0}</b> but{Number(performance.goals) > 1 ? "s" : ""}</span><span><b className="text-content">{performance.assists || 0}</b> passe{Number(performance.assists) > 1 ? "s" : ""}</span></div></Link>; })}</div> : <EmptyBlock>Ce récap est prêt. Il s'alimentera avec les compositions et performances, sans appel supplémentaire depuis la page publique.</EmptyBlock>,

    players: <div id="all-players" className="scroll-mt-24"><div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-xl font-black sm:text-2xl">Tous les Belges suivis</h2><p className="mt-1 text-xs text-muted">Joueurs belges évoluant actuellement hors de Belgique.</p></div><span className="rounded-full border border-line/15 bg-surface px-3 py-1 text-xs font-bold text-muted">{shown.length} joueur{shown.length > 1 ? "s" : ""}</span></div><div className="mb-5 grid gap-2 rounded-2xl border border-line/10 bg-surface/70 p-3 sm:grid-cols-2 lg:grid-cols-5"><label className="flex items-center gap-2 rounded-xl border border-line/10 bg-bg/50 px-3"><Search className="h-4 w-4 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Joueur ou club…" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" /></label><select value={country} onChange={(event) => setCountry(event.target.value)} className="rounded-xl border border-line/10 bg-bg/50 px-3 py-2 text-sm"><option value="all">Tous les pays</option>{countries.map((item) => <option key={item}>{item}</option>)}</select><select value={competition} onChange={(event) => setCompetition(event.target.value)} className="rounded-xl border border-line/10 bg-bg/50 px-3 py-2 text-sm"><option value="all">Tous les championnats</option>{competitionNames.map((item) => <option key={item}>{item}</option>)}</select><select value={position} onChange={(event) => setPosition(event.target.value)} className="rounded-xl border border-line/10 bg-bg/50 px-3 py-2 text-sm"><option value="all">Tous les postes</option>{["Gardien", "Défenseur", "Milieu", "Attaquant"].map((item) => <option key={item}>{item}</option>)}</select><select value={profile} onChange={(event) => setProfile(event.target.value)} aria-label="Profil" className="rounded-xl border border-line/10 bg-bg/50 px-3 py-2 text-sm"><option value="all">Tous les profils</option><option value="binational">Binationaux à suivre</option><option value="belgium">Hors binationaux</option></select></div>{view.enriched.length === 0 ? <div className="rounded-3xl border border-dashed border-line/20 bg-surface/50 px-6 py-12 text-center"><div className="text-3xl">🇧🇪</div><h2 className="mt-3 text-xl font-black">Le suivi international est prêt</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">Ajoutez une compétition étrangère dans l'admin, masquez-la du portail si nécessaire, puis activez « Suivi Belfoot » sur les joueurs retenus.</p></div> : shown.length === 0 ? <p className="rounded-2xl border border-line/10 bg-surface p-5 text-sm text-muted">Aucun joueur ne correspond à ces filtres.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{shown.map(({ player, club, watch, nationalTeam, country: playerCountry, competition: playerCompetition, totals }) => <Link key={player.id} href={`/players/${player.id}`} className="group relative overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-br from-surface to-bg/50 p-4 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_20px_45px_-28px_rgba(227,6,19,0.65)] lg:p-3"><div className="flex items-start gap-3"><PlayerPhoto player={player} className="h-16 w-16 lg:h-12 lg:w-12" /><div className="min-w-0 flex-1"><h3 className="truncate text-base font-black group-hover:text-accent lg:text-sm">{player.name}</h3>{watch === "binational" && <span title={nationalTeam?.name ? `Sélection représentée : ${nationalTeam.name}` : "Belge binational à suivre"} className="mt-0.5 inline-block rounded-full bg-amber-300/15 px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-amber-200 ring-1 ring-amber-300/25">Binational{nationalTeam?.name ? ` · ${nationalTeam.name}` : ""}</span>}<div className="mt-1 flex items-center gap-1.5 text-xs text-muted">{club?.logo_url && <img src={club.logo_url} className="h-4 w-4 object-contain" alt="" />}<span className="truncate">{club?.name || "Club à renseigner"}</span></div><div className="mt-1.5 truncate text-[10px] text-muted"><span className="mr-1">{countryFlag(playerCountry)}</span>{playerCountry} · {playerCompetition}</div></div></div><div className="mt-3 grid grid-cols-4 gap-1 border-t border-line/10 pt-2.5 text-center"><div><b className="block text-base">{totals.appearances}</b><span className="text-[8px] uppercase tracking-wider text-muted">Matchs</span></div><div><b className="block text-base">{totals.goals}</b><span className="text-[8px] uppercase tracking-wider text-muted">Buts</span></div><div><b className="block text-base">{totals.assists}</b><span className="text-[8px] uppercase tracking-wider text-muted">Passes</span></div><div><b className={`block text-base ${totals.rating ? ratingTone(totals.rating).split(" ")[1] : ""}`}>{totals.rating?.toFixed(1) || "—"}</b><span className="text-[8px] uppercase tracking-wider text-muted">Note</span></div></div></Link>)}</div>}</div>,
  };

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 bg-[radial-gradient(circle_at_top,rgba(227,6,19,0.14),transparent_68%)]" />
      <section className="relative mb-8 min-h-[300px] overflow-hidden rounded-3xl border border-line/10 bg-gradient-to-br from-surface via-surface2/80 to-bg bg-cover bg-center px-6 py-7 shadow-[0_24px_70px_-45px_rgba(0,0,0,0.95)] sm:px-8 sm:py-9" style={heroStyle}>
        {config.hero.image_url && <div className="absolute inset-0 bg-[#071426]" style={{ opacity: safeOverlay(config.hero.overlay) }} />}
        {!config.hero.image_url && view.featured?.player.photo_url && <img src={view.featured.player.photo_url} className="pointer-events-none absolute bottom-0 right-6 hidden h-[92%] w-[42%] object-contain object-bottom opacity-80 [mask-image:linear-gradient(to_left,black_55%,transparent)] sm:block" alt="" />}
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:38px_38px]" />
        <div className="relative max-w-2xl"><div className="text-xs font-black uppercase tracking-[0.22em] text-accent">{config.hero.kicker}</div><h1 className="mt-2 text-3xl font-black sm:text-5xl">{config.hero.title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">{config.hero.intro}</p><div className="mt-6 grid grid-cols-3 gap-2 sm:max-w-lg sm:gap-3"><div className="rounded-2xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm"><Users className="mb-2 h-4 w-4 text-accent" /><b className="text-xl">{view.enriched.length}</b><span className="block text-[10px] uppercase tracking-wider text-slate-400">{config.hero.players_label}</span></div><div className="rounded-2xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm"><MapPin className="mb-2 h-4 w-4 text-accent" /><b className="text-xl">{countries.length}</b><span className="block text-[10px] uppercase tracking-wider text-slate-400">{config.hero.countries_label}</span></div><div className="rounded-2xl border border-white/10 bg-black/20 p-3 backdrop-blur-sm"><Trophy className="mb-2 h-4 w-4 text-accent" /><b className="text-xl">{clubCount}</b><span className="block text-[10px] uppercase tracking-wider text-slate-400">{config.hero.clubs_label}</span></div></div></div>
      </section>

      {data.loading && <div className="grid gap-4 sm:grid-cols-2"><div className="h-48 animate-pulse rounded-2xl bg-surface" /><div className="h-48 animate-pulse rounded-2xl bg-surface" /></div>}
      {!data.loading && data.error && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">Impossible de charger les Belges à l'étranger : {data.error}</p>}
      {!data.loading && !data.error && <>
        {view.enriched.length > 0 && <div className="space-y-9"><FeaturedPlayer item={view.featured} /><BelgiansWorldMap players={view.enriched} />{config.sections.find((section) => section.key === "form")?.enabled !== false && <section><SectionHeader section={config.sections.find((section) => section.key === "form")} />{content.form}</section>}{config.sections.filter((section) => section.enabled && !["players", "form"].includes(section.key)).map((section) => <section key={section.key}><SectionHeader section={section} />{content[section.key]}</section>)}</div>}
        {config.sections.find((section) => section.key === "players")?.enabled !== false && <section className={view.enriched.length > 0 ? "mt-9" : ""}>{content.players}</section>}
      </>}
    </div>
  );
}
