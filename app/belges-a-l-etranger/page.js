"use client";
import Link from "next/link";
import { Search, MapPin, Trophy, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLabels } from "@/lib/labels";

const FLAGS = { England: "🏴", France: "🇫🇷", Germany: "🇩🇪", Italy: "🇮🇹", Spain: "🇪🇸", Netherlands: "🇳🇱", Portugal: "🇵🇹", Scotland: "🏴", Turkey: "🇹🇷", Austria: "🇦🇹", Switzerland: "🇨🇭", Greece: "🇬🇷", USA: "🇺🇸", Belgium: "🇧🇪" };
const POSITIONS = { Goalkeeper: "Gardien", GK: "Gardien", Defender: "Défenseur", DEF: "Défenseur", Midfielder: "Milieu", MID: "Milieu", Attacker: "Attaquant", FWD: "Attaquant" };
const normal = (value) => String(value || "").trim().toLocaleLowerCase("fr");
const isBelgian = (value) => normal(value).startsWith("belg");
const year = (value) => Number((String(value || "").match(/\d{4}/) || [0])[0]);

function latestTotals(rows = []) {
  const latest = Math.max(0, ...rows.map((row) => year(row.season)));
  const selected = latest ? rows.filter((row) => year(row.season) === latest) : rows;
  const sum = (key) => selected.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const ratings = selected.filter((row) => row.rating != null && Number(row.rating) > 0).map((row) => Number(row.rating));
  return { season: latest || "—", appearances: sum("appearances"), minutes: sum("minutes"), goals: sum("goals"), assists: sum("assists"), rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null };
}

export default function BelgiansAbroadPage() {
  const L = useLabels();
  const [players, setPlayers] = useState([]);
  const [clubs, setClubs] = useState({});
  const [competitions, setCompetitions] = useState({});
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const [competition, setCompetition] = useState("all");
  const [position, setPosition] = useState("all");

  useEffect(() => { (async () => {
    const [{ data: playerRows, error: playerError }, { data: competitionRows, error: competitionError }] = await Promise.all([
      supabase.from("players").select("*").eq("tracked", true).eq("active", true),
      supabase.from("competitions").select("*"),
    ]);
    if (playerError) throw playerError;
    if (competitionError) throw competitionError;
    const belgianRows = (playerRows || []).filter((player) => isBelgian(player.nationality));
    const clubIds = [...new Set(belgianRows.map((player) => player.club_id).filter(Boolean))];
    const playerIds = belgianRows.map((player) => player.id);
    const [clubResult, statsResult] = await Promise.all([
      clubIds.length ? supabase.from("clubs").select("id,name,logo_url").in("id", clubIds) : Promise.resolve({ data: [] }),
      playerIds.length ? supabase.from("player_season_stats").select("*").in("player_id", playerIds) : Promise.resolve({ data: [] }),
    ]);
    if (clubResult.error) throw clubResult.error;
    if (statsResult.error) throw statsResult.error;
    const compMap = Object.fromEntries((competitionRows || []).map((item) => [item.id, item]));
    const statsMap = {};
    for (const row of statsResult.data || []) (statsMap[row.player_id] ||= []).push(row);
    setPlayers(belgianRows); setClubs(Object.fromEntries((clubResult.data || []).map((item) => [item.id, item]))); setCompetitions(compMap); setStats(statsMap);
    setLoading(false);
  })().catch((e) => { setError(e.message || String(e)); setLoading(false); }); }, []);

  const enriched = useMemo(() => players.map((player) => {
    const playerStats = stats[player.id] || [];
    const statsCompetition = playerStats.map((row) => competitions[row.competition_id]).find((item) => item?.ext?.country);
    const resolvedCountry = player.country || statsCompetition?.ext?.country || "À renseigner";
    const resolvedCompetition = player.competition || statsCompetition?.name || "Championnat à renseigner";
    return { player, club: clubs[player.club_id], country: resolvedCountry, competition: resolvedCompetition, totals: latestTotals(playerStats) };
  }).filter((item) => !isBelgian(item.country) && !["jupiler pro league", "croky cup", "pro league"].includes(normal(item.competition))), [players, clubs, competitions, stats]);

  const countries = [...new Set(enriched.map((item) => item.country))].sort((a, b) => a.localeCompare(b, "fr"));
  const competitionNames = [...new Set(enriched.map((item) => item.competition))].sort((a, b) => a.localeCompare(b, "fr"));
  const shown = enriched.filter((item) => {
    const matchesQuery = !query.trim() || normal(item.player.name).includes(normal(query)) || normal(item.club?.name).includes(normal(query));
    return matchesQuery && (country === "all" || item.country === country) && (competition === "all" || item.competition === competition) && (position === "all" || (POSITIONS[item.player.position] || item.player.position) === position);
  }).sort((a, b) => (b.totals.goals + b.totals.assists) - (a.totals.goals + a.totals.assists) || a.player.name.localeCompare(b.player.name, "fr"));
  const clubCount = new Set(enriched.map((item) => item.club?.id).filter(Boolean)).size;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 bg-[radial-gradient(circle_at_top,rgba(227,6,19,0.14),transparent_68%)]" />
      <section className="mb-7 overflow-hidden rounded-3xl border border-line/10 bg-gradient-to-br from-surface via-surface2/80 to-bg p-6 shadow-[0_24px_70px_-45px_rgba(0,0,0,0.95)] sm:p-8">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-accent">{L("belgians.kicker", "Belfoot à l'étranger")}</div>
        <h1 className="mt-2 text-3xl font-black sm:text-5xl">{L("belgians.title", "Les Belges. Partout.")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">{L("belgians.intro", "Retrouvez les joueurs belges suivis hors de Belgique, leur club et leurs statistiques de la saison.")}</p>
        <div className="mt-6 grid grid-cols-3 gap-2 sm:max-w-lg sm:gap-3">
          <div className="rounded-2xl border border-line/10 bg-white/[0.035] p-3"><Users className="mb-2 h-4 w-4 text-accent" /><b className="text-xl">{enriched.length}</b><span className="block text-[10px] uppercase tracking-wider text-muted">Joueurs</span></div>
          <div className="rounded-2xl border border-line/10 bg-white/[0.035] p-3"><MapPin className="mb-2 h-4 w-4 text-accent" /><b className="text-xl">{countries.length}</b><span className="block text-[10px] uppercase tracking-wider text-muted">Pays</span></div>
          <div className="rounded-2xl border border-line/10 bg-white/[0.035] p-3"><Trophy className="mb-2 h-4 w-4 text-accent" /><b className="text-xl">{clubCount}</b><span className="block text-[10px] uppercase tracking-wider text-muted">Clubs</span></div>
        </div>
      </section>

      <div className="mb-6 grid gap-2 rounded-2xl border border-line/10 bg-surface/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex items-center gap-2 rounded-xl border border-line/10 bg-bg/50 px-3"><Search className="h-4 w-4 text-muted" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Joueur ou club…" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" /></label>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-xl border border-line/10 bg-bg/50 px-3 py-2 text-sm"><option value="all">Tous les pays</option>{countries.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={competition} onChange={(e) => setCompetition(e.target.value)} className="rounded-xl border border-line/10 bg-bg/50 px-3 py-2 text-sm"><option value="all">Tous les championnats</option>{competitionNames.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={position} onChange={(e) => setPosition(e.target.value)} className="rounded-xl border border-line/10 bg-bg/50 px-3 py-2 text-sm"><option value="all">Tous les postes</option>{["Gardien", "Défenseur", "Milieu", "Attaquant"].map((item) => <option key={item}>{item}</option>)}</select>
      </div>

      {loading && <p className="text-muted">Chargement des joueurs suivis…</p>}
      {!loading && error && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">Impossible de charger les Belges à l'étranger : {error}</p>}
      {!loading && !error && enriched.length === 0 && <div className="rounded-3xl border border-dashed border-line/20 bg-surface/50 px-6 py-12 text-center"><div className="text-3xl">🇧🇪</div><h2 className="mt-3 text-xl font-black">{L("belgians.emptyTitle", "Le suivi international est prêt")}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">{L("belgians.empty", "Ajoutez une compétition étrangère dans l'admin, masquez-la des pages publiques si nécessaire, lancez la découverte puis activez « Suivi Belfoot » sur les joueurs retenus.")}</p></div>}
      {!loading && !error && enriched.length > 0 && shown.length === 0 && <p className="rounded-2xl border border-line/10 bg-surface p-5 text-sm text-muted">Aucun joueur ne correspond à ces filtres.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(({ player, club, country: playerCountry, competition: playerCompetition, totals }) => (
          <Link key={player.id} href={`/players/${player.id}`} className="group relative overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-br from-surface to-bg/50 p-4 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_20px_45px_-28px_rgba(227,6,19,0.65)]">
            <div className="flex items-start gap-3">
              {player.photo_url ? <img src={player.photo_url} className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-white/10" alt="" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-xl font-black">{player.name?.slice(0, 2).toUpperCase()}</span>}
              <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-black group-hover:text-accent">{player.name}</h2><div className="mt-1 flex items-center gap-2 text-xs text-muted">{club?.logo_url && <img src={club.logo_url} className="h-5 w-5 object-contain" alt="" />}<span className="truncate">{club?.name || "Club à renseigner"}</span></div><div className="mt-2 text-[11px] text-muted"><span className="mr-1">{FLAGS[playerCountry] || "🌍"}</span>{playerCountry} · {playerCompetition}</div></div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-1 border-t border-line/10 pt-3 text-center"><div><b className="block text-lg">{totals.appearances}</b><span className="text-[9px] uppercase tracking-wider text-muted">Matchs</span></div><div><b className="block text-lg">{totals.goals}</b><span className="text-[9px] uppercase tracking-wider text-muted">Buts</span></div><div><b className="block text-lg">{totals.assists}</b><span className="text-[9px] uppercase tracking-wider text-muted">Passes</span></div><div><b className="block text-lg">{totals.rating?.toFixed(1) || "—"}</b><span className="text-[9px] uppercase tracking-wider text-muted">Note</span></div></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
