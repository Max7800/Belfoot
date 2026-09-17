"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, Flame, Globe2, MapPin, Search, Sparkles, Trophy, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useBelgiansAbroadConfig } from "@/lib/belgiansAbroad";
import { supabase } from "@/lib/supabaseClient";

const FLAGS = { England: "🏴", France: "🇫🇷", Germany: "🇩🇪", Italy: "🇮🇹", Spain: "🇪🇸", Netherlands: "🇳🇱", Portugal: "🇵🇹", Scotland: "🏴", Turkey: "🇹🇷", Austria: "🇦🇹", Switzerland: "🇨🇭", Greece: "🇬🇷", USA: "🇺🇸", Belgium: "🇧🇪" };
const POSITIONS = { Goalkeeper: "Gardien", GK: "Gardien", Defender: "Défenseur", DEF: "Défenseur", Midfielder: "Milieu", MID: "Milieu", Attacker: "Attaquant", FWD: "Attaquant" };
const SECTION_ICONS = { today: CalendarDays, form: Flame, leagues: Globe2, recap: Clock3, players: Users };
const SECTION_LINKS = { today: "/matchs", form: "#all-players", recap: "/matchs" };
const normal = (value) => String(value || "").trim().toLocaleLowerCase("fr");
const isBelgian = (value) => normal(value).startsWith("belg");
const year = (value) => Number((String(value || "").match(/\d{4}/) || [0])[0]);
const safeColor = (value, fallback = "#e30613") => /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
const safeOverlay = (value, fallback = 0.42) => Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : fallback;

function latestTotals(rows = []) {
  const latest = Math.max(0, ...rows.map((row) => year(row.season)));
  const selected = latest ? rows.filter((row) => year(row.season) === latest) : rows;
  const sum = (key) => selected.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const ratings = selected.filter((row) => Number(row.rating) > 0).map((row) => Number(row.rating));
  return { season: latest || "—", appearances: sum("appearances"), minutes: sum("minutes"), goals: sum("goals"), assists: sum("assists"), rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null };
}

function PlayerPhoto({ player, className = "h-16 w-16" }) {
  return player?.photo_url
    ? <img src={player.photo_url} className={`${className} shrink-0 rounded-2xl object-cover ring-1 ring-white/10`} alt="" />
    : <span className={`${className} flex shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-lg font-black`}>{player?.name?.slice(0, 2).toUpperCase()}</span>;
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

export default function BelgiansAbroadPage() {
  const config = useBelgiansAbroadConfig();
  const [data, setData] = useState({ players: [], clubs: {}, competitions: {}, stats: {}, matches: [], performances: [], loading: true, error: "" });
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const [competition, setCompetition] = useState("all");
  const [position, setPosition] = useState("all");

  useEffect(() => { (async () => {
    const [playerResult, competitionResult] = await Promise.all([
      supabase.from("players").select("*").eq("tracked", true).eq("active", true),
      supabase.from("competitions").select("*"),
    ]);
    if (playerResult.error) throw playerResult.error;
    if (competitionResult.error) throw competitionResult.error;
    const players = (playerResult.data || []).filter((player) => isBelgian(player.nationality));
    const playerIds = players.map((player) => player.id);
    const [clubResult, statsResult, matchResult, performanceResult] = await Promise.all([
      supabase.from("clubs").select("id,name,logo_url"),
      playerIds.length ? supabase.from("player_season_stats").select("*").in("player_id", playerIds) : Promise.resolve({ data: [] }),
      supabase.from("matches").select("*").order("kickoff", { ascending: false }).limit(700),
      playerIds.length ? supabase.from("match_player_stats").select("*").in("player_id", playerIds).limit(500) : Promise.resolve({ data: [] }),
    ]);
    if (clubResult.error) throw clubResult.error;
    if (statsResult.error) throw statsResult.error;
    const stats = {};
    for (const row of statsResult.data || []) (stats[row.player_id] ||= []).push(row);
    setData({
      players,
      clubs: Object.fromEntries((clubResult.data || []).map((item) => [item.id, item])),
      competitions: Object.fromEntries((competitionResult.data || []).map((item) => [item.id, item])),
      stats,
      matches: matchResult.data || [],
      performances: performanceResult.error ? [] : performanceResult.data || [],
      loading: false,
      error: "",
    });
  })().catch((error) => setData((current) => ({ ...current, loading: false, error: error.message || String(error) }))); }, []);

  const view = useMemo(() => {
    const enriched = data.players.map((player) => {
      const playerStats = data.stats[player.id] || [];
      const statsCompetition = playerStats.map((row) => data.competitions[row.competition_id]).find((item) => item?.ext?.country);
      const resolvedCountry = player.country || statsCompetition?.ext?.country || "À renseigner";
      const resolvedCompetition = player.competition || statsCompetition?.name || "Championnat à renseigner";
      return { player, club: data.clubs[player.club_id], country: resolvedCountry, competition: resolvedCompetition, competitionData: statsCompetition, totals: latestTotals(playerStats) };
    }).filter((item) => !isBelgian(item.country) && !["jupiler pro league", "croky cup", "pro league", "challenger pro league"].includes(normal(item.competition)));

    const playerMap = Object.fromEntries(enriched.map((item) => [item.player.id, item]));
    const matchMap = Object.fromEntries(data.matches.map((match) => [match.id, match]));
    const now = new Date();
    const watched = data.matches.filter((match) => match.kickoff && match.status !== "finished" && new Date(match.kickoff) >= now && enriched.some((item) => item.player.club_id === match.home_club_id || item.player.club_id === match.away_club_id)).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)).slice(0, 6).map((match) => ({ match, players: enriched.filter((item) => item.player.club_id === match.home_club_id || item.player.club_id === match.away_club_id) }));

    const performances = data.performances.map((performance) => ({ performance, item: playerMap[performance.player_id], match: matchMap[performance.match_id] })).filter((row) => row.item && row.match?.kickoff).sort((a, b) => new Date(b.match.kickoff) - new Date(a.match.kickoff));
    const byPlayer = {};
    for (const row of performances) if ((byPlayer[row.item.player.id] ||= []).length < 5) byPlayer[row.item.player.id].push(row);
    const form = enriched.map((item) => {
      const recent = byPlayer[item.player.id] || [];
      const goals = recent.reduce((sum, row) => sum + (Number(row.performance.goals) || 0), 0);
      const assists = recent.reduce((sum, row) => sum + (Number(row.performance.assists) || 0), 0);
      const ratings = recent.map((row) => Number(row.performance.rating)).filter((value) => value > 0);
      const rating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : item.totals.rating;
      return { ...item, recentCount: recent.length, goals: recent.length ? goals : item.totals.goals, assists: recent.length ? assists : item.totals.assists, rating, score: goals * 4 + assists * 3 + (rating || 0) + (recent.length ? recent.length : item.totals.appearances / 10) };
    }).sort((a, b) => b.score - a.score || a.player.name.localeCompare(b.player.name, "fr"));

    const leagues = Object.values(enriched.reduce((groups, item) => {
      const key = item.competition || "Autres championnats";
      if (!groups[key]) groups[key] = { name: key, country: item.country, logo: item.competitionData?.logo_url || "", count: 0 };
      groups[key].count += 1;
      return groups;
    }, {})).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));

    const featured = enriched.find((item) => item.player.id === config.hero.featured_player_id) || form[0] || enriched[0];
    return { enriched, watched, performances: performances.slice(0, 8), form: form.slice(0, 5), leagues, featured };
  }, [data, config.hero.featured_player_id]);

  const countries = [...new Set(view.enriched.map((item) => item.country))].sort((a, b) => a.localeCompare(b, "fr"));
  const competitionNames = [...new Set(view.enriched.map((item) => item.competition))].sort((a, b) => a.localeCompare(b, "fr"));
  const shown = view.enriched.filter((item) => {
    const matchesQuery = !query.trim() || normal(item.player.name).includes(normal(query)) || normal(item.club?.name).includes(normal(query));
    return matchesQuery && (country === "all" || item.country === country) && (competition === "all" || item.competition === competition) && (position === "all" || (POSITIONS[item.player.position] || item.player.position) === position);
  }).sort((a, b) => (b.totals.goals + b.totals.assists) - (a.totals.goals + a.totals.assists) || a.player.name.localeCompare(b.player.name, "fr"));
  const clubCount = new Set(view.enriched.map((item) => item.club?.id).filter(Boolean)).size;
  const heroStyle = config.hero.image_url ? { backgroundImage: `url(${config.hero.image_url})` } : undefined;

  const selectLeague = (name) => {
    setCompetition(name);
    setTimeout(() => document.getElementById("all-players")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const content = {
    today: view.watched.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{view.watched.map(({ match, players }) => { const home = data.clubs[match.home_club_id]; const away = data.clubs[match.away_club_id]; return <Link key={match.id} href={`/matchs/${match.id}`} className="group overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-br from-surface to-bg/60 p-4 transition hover:-translate-y-0.5 hover:border-amber-400/40"><div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted"><span>{new Date(match.kickoff).toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "short" })}</span><b className="text-content">{new Date(match.kickoff).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}</b></div><div className="my-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center"><div>{home?.logo_url && <img src={home.logo_url} className="mx-auto h-10 w-10 object-contain" alt="" />}<div className="mt-2 truncate text-xs font-bold">{home?.name || "—"}</div></div><span className="text-xs text-muted">VS</span><div>{away?.logo_url && <img src={away.logo_url} className="mx-auto h-10 w-10 object-contain" alt="" />}<div className="mt-2 truncate text-xs font-bold">{away?.name || "—"}</div></div></div><div className="flex items-center gap-2 border-t border-line/10 pt-3">{players.slice(0, 3).map((item) => <PlayerPhoto key={item.player.id} player={item.player} className="h-9 w-9" />)}<div className="min-w-0 text-xs font-semibold text-amber-300">{players.map((item) => item.player.name).join(" · ")}</div></div></Link>; })}</div> : <EmptyBlock>Les prochains matchs apparaîtront ici dès qu'une compétition étrangère synchronisée concerne un joueur suivi.</EmptyBlock>,

    form: view.form.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{view.form.map((item, index) => <Link key={item.player.id} href={`/players/${item.player.id}`} className="group relative overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/60 p-3 text-center transition hover:-translate-y-0.5 hover:border-orange-400/40">{index === 0 && <span className="absolute right-2 top-2 text-sm">🔥</span>}<PlayerPhoto player={item.player} className="mx-auto h-16 w-16" /><div className="mt-2 truncate text-sm font-black group-hover:text-orange-300">{item.player.name}</div><div className="truncate text-[10px] text-muted">{item.club?.name || "Club à renseigner"}</div><div className="mt-3 flex justify-center gap-3 text-xs"><span><b className="block text-lg">{item.goals}</b>buts</span><span><b className="block text-lg">{item.assists}</b>passes</span></div><div className="mt-2 text-[10px] text-muted">{item.recentCount ? `${item.recentCount} dernières performances` : "Saison en cours"}{item.rating ? ` · ${item.rating.toFixed(1)}` : ""}</div></Link>)}</div> : <EmptyBlock>Les statistiques existantes alimenteront automatiquement ce classement de forme.</EmptyBlock>,

    leagues: view.leagues.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{view.leagues.map((league, index) => <button key={league.name} onClick={() => selectLeague(league.name)} className="group rounded-2xl border border-line/10 bg-gradient-to-br from-surface to-bg/50 p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-400/40">{league.logo ? <img src={league.logo} className="h-9 w-9 object-contain" alt="" /> : <Globe2 className={`h-8 w-8 ${index % 2 ? "text-violet-400" : "text-sky-400"}`} />}<div className="mt-4 truncate text-sm font-black">{league.name}</div><div className="mt-1 text-[11px] text-muted">{FLAGS[league.country] || "🌍"} {league.country}</div><div className="mt-3 text-xl font-black">{league.count}<span className="ml-1 text-[10px] font-normal text-muted">Belge{league.count > 1 ? "s" : ""} suivi{league.count > 1 ? "s" : ""}</span></div></button>)}</div> : <EmptyBlock>Les championnats apparaîtront ici dès que le pays et la compétition des joueurs suivis seront renseignés.</EmptyBlock>,

    recap: view.performances.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{view.performances.map(({ performance, item, match }) => { const opponentId = item.player.club_id === match.home_club_id ? match.away_club_id : match.home_club_id; const opponent = data.clubs[opponentId]; return <Link key={performance.id} href={`/matchs/${match.id}`} className="rounded-2xl border border-line/10 bg-surface/70 p-4 transition hover:border-violet-400/40"><div className="flex items-center gap-3"><PlayerPhoto player={item.player} className="h-12 w-12" /><div className="min-w-0"><div className="truncate text-sm font-black">{item.player.name}</div><div className="truncate text-[10px] text-muted">vs {opponent?.name || "adversaire"} · {new Date(match.kickoff).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}</div></div>{performance.rating && <b className="ml-auto rounded-lg bg-violet-400/15 px-2 py-1 text-sm text-violet-300">{Number(performance.rating).toFixed(1)}</b>}</div><div className="mt-3 flex gap-3 border-t border-line/10 pt-3 text-[11px] text-muted"><span><b className="text-content">{performance.minutes || 0}</b> min</span><span><b className="text-content">{performance.goals || 0}</b> but{Number(performance.goals) > 1 ? "s" : ""}</span><span><b className="text-content">{performance.assists || 0}</b> passe{Number(performance.assists) > 1 ? "s" : ""}</span></div></Link>; })}</div> : <EmptyBlock>Ce récap est prêt. Il s'alimentera avec les compositions et performances, sans appel supplémentaire depuis la page publique.</EmptyBlock>,

    players: <div id="all-players" className="scroll-mt-24"><div className="mb-5 grid gap-2 rounded-2xl border border-line/10 bg-surface/70 p-3 sm:grid-cols-2 lg:grid-cols-4"><label className="flex items-center gap-2 rounded-xl border border-line/10 bg-bg/50 px-3"><Search className="h-4 w-4 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Joueur ou club…" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" /></label><select value={country} onChange={(event) => setCountry(event.target.value)} className="rounded-xl border border-line/10 bg-bg/50 px-3 py-2 text-sm"><option value="all">Tous les pays</option>{countries.map((item) => <option key={item}>{item}</option>)}</select><select value={competition} onChange={(event) => setCompetition(event.target.value)} className="rounded-xl border border-line/10 bg-bg/50 px-3 py-2 text-sm"><option value="all">Tous les championnats</option>{competitionNames.map((item) => <option key={item}>{item}</option>)}</select><select value={position} onChange={(event) => setPosition(event.target.value)} className="rounded-xl border border-line/10 bg-bg/50 px-3 py-2 text-sm"><option value="all">Tous les postes</option>{["Gardien", "Défenseur", "Milieu", "Attaquant"].map((item) => <option key={item}>{item}</option>)}</select></div>{shown.length === 0 ? <p className="rounded-2xl border border-line/10 bg-surface p-5 text-sm text-muted">Aucun joueur ne correspond à ces filtres.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{shown.map(({ player, club, country: playerCountry, competition: playerCompetition, totals }) => <Link key={player.id} href={`/players/${player.id}`} className="group relative overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-br from-surface to-bg/50 p-4 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_20px_45px_-28px_rgba(227,6,19,0.65)]"><div className="flex items-start gap-3"><PlayerPhoto player={player} /><div className="min-w-0 flex-1"><h3 className="truncate text-lg font-black group-hover:text-accent">{player.name}</h3><div className="mt-1 flex items-center gap-2 text-xs text-muted">{club?.logo_url && <img src={club.logo_url} className="h-5 w-5 object-contain" alt="" />}<span className="truncate">{club?.name || "Club à renseigner"}</span></div><div className="mt-2 text-[11px] text-muted"><span className="mr-1">{FLAGS[playerCountry] || "🌍"}</span>{playerCountry} · {playerCompetition}</div></div></div><div className="mt-4 grid grid-cols-4 gap-1 border-t border-line/10 pt-3 text-center"><div><b className="block text-lg">{totals.appearances}</b><span className="text-[9px] uppercase tracking-wider text-muted">Matchs</span></div><div><b className="block text-lg">{totals.goals}</b><span className="text-[9px] uppercase tracking-wider text-muted">Buts</span></div><div><b className="block text-lg">{totals.assists}</b><span className="text-[9px] uppercase tracking-wider text-muted">Passes</span></div><div><b className="block text-lg">{totals.rating?.toFixed(1) || "—"}</b><span className="text-[9px] uppercase tracking-wider text-muted">Note</span></div></div></Link>)}</div>}</div>,
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
      {!data.loading && !data.error && view.enriched.length === 0 && <div className="rounded-3xl border border-dashed border-line/20 bg-surface/50 px-6 py-12 text-center"><div className="text-3xl">🇧🇪</div><h2 className="mt-3 text-xl font-black">Le suivi international est prêt</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">Ajoutez une compétition étrangère dans l'admin, masquez-la du portail si nécessaire, puis activez « Suivi Belfoot » sur les joueurs retenus.</p></div>}
      {!data.loading && !data.error && view.enriched.length > 0 && <>
        {config.sections.find((section) => section.key === "players")?.enabled !== false && <section>{content.players}</section>}
        <div className="mt-9 space-y-9">{config.sections.filter((section) => section.enabled && section.key !== "players").map((section) => <section key={section.key}><SectionHeader section={section} />{content[section.key]}</section>)}</div>
      </>}
    </div>
  );
}
