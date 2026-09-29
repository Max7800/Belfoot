"use client";
import Link from "next/link";
import { Calendar, CalendarDays, List } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";
import SeasonCalendar from "@/components/football/SeasonCalendar";
import StandingsTable from "@/components/football/StandingsTable";
import CupRounds from "@/components/football/CupRounds";
import NationsLeagueStandings from "@/components/football/NationsLeagueStandings";
import CompetitionHeader from "@/components/football/CompetitionHeader";
import Watermark from "@/components/football/Watermark";
import { computeStandings } from "@/lib/standings";
import { competitionPhases, formatCompetitionName, getCompetitionType, isEuropeanClubCompetition, isKnockoutPhase } from "@/lib/competitionType";
import { competitionPath, resolveCompetitionRoute } from "@/lib/competitionRoutes";
import { useLabels } from "@/lib/labels";
import { useTiles } from "@/lib/tiles";
import { zoneAt, zonesForPhase } from "@/lib/standingsZones";
import { useStatsSections } from "@/lib/statsSections";
import { sortPublicSeasons } from "@/lib/publicSeasons";
import { isNationsLeagueCompetition, nationsLeagueGroups } from "@/lib/nationsLeague";
import { PUBLIC_PLAYER_FIELDS, PUBLIC_PLAYER_STATS_FIELDS, loadClubsForMatches, loadMatchStatsForMatches, loadPlayersByIds, loadSeasonMatches } from "@/lib/publicFootballData";
import { playerAge } from "@/lib/playerAge";
import { preferAssignedPlayerStats } from "@/lib/playerStats";
import { nationalityBadges } from "@/lib/nationalities";

const POS = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };
const VARIANTS = {
  topscorer: { border: "border-amber-400/50", glow: "shadow-[0_0_34px_-12px_rgba(244,196,48,0.45)]", grad: "from-amber-400/10", accent: "#f4c430", wm: "ball", icon: "⚽" },
  topassist: { border: "border-red-500/50", glow: "shadow-[0_0_34px_-12px_rgba(239,68,68,0.45)]", grad: "from-red-500/10", accent: "#ef4444", wm: "boot", icon: "👟" },
  cleansheet: { border: "border-sky-400/50", glow: "shadow-[0_0_34px_-12px_rgba(56,189,248,0.45)]", grad: "from-sky-400/10", accent: "#38bdf8", wm: "glove", icon: "🧤" },
};
const isBelgianClubCountry = (value) => ["belgium", "belgique"].includes(String(value || "").trim().toLowerCase());
function seasonKey(value) { return (String(value || "").match(/\d{4}/) || [String(value || "")])[0]; }
function clubForm(ms, clubId) {
  const rel = ms.filter((m) => m.home_score != null && (m.home_club_id === clubId || m.away_club_id === clubId)).sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 5).reverse();
  const res = [];
  for (const m of rel) { const home = m.home_club_id === clubId; const gf = home ? m.home_score : m.away_score, ga = home ? m.away_score : m.home_score; res.push(gf > ga ? "V" : gf === ga ? "N" : "D"); }
  return res;
}

function statsByPlayer(rows) {
  const totals = new Map();
  for (const row of rows) {
    const current = totals.get(row.player_id) || { ...row, appearances: 0, lineups: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, _clubAppearances: -1, _ratingWeight: 0, _ratingTotal: 0 };
    for (const key of ["appearances", "lineups", "minutes", "goals", "assists", "yellow", "red"]) current[key] += Number(row[key]) || 0;
    const rating = Number(row.rating);
    const weight = Math.max(1, Number(row.appearances) || 0);
    if (rating > 0) { current._ratingTotal += rating * weight; current._ratingWeight += weight; }
    if (row.club_id && (Number(row.appearances) || 0) >= current._clubAppearances) {
      current.club_id = row.club_id;
      current._clubAppearances = Number(row.appearances) || 0;
    }
    current.rating = current._ratingWeight ? current._ratingTotal / current._ratingWeight : null;
    totals.set(row.player_id, current);
  }
  return Object.fromEntries([...totals.entries()].map(([playerId, row]) => {
    const clean = { ...row };
    delete clean._clubAppearances;
    delete clean._ratingTotal;
    delete clean._ratingWeight;
    return [playerId, clean];
  }));
}

function matchStatsByPlayer(rows) {
  return statsByPlayer(rows.filter((row) => row.player_id).map((row) => ({
    ...row,
    appearances: Number(row.minutes) > 0 || row.starter ? 1 : 0,
    lineups: row.starter ? 1 : 0,
  })));
}

export default function CompetitionPage() {
  const { slug } = useParams();
  const searchParams = useSearchParams();
  const L = useLabels();
  const [comp, setComp] = useState(undefined);
  const tileScope = (comp?.competition_scope === "international" || isNationsLeagueCompetition(comp)) ? "international" : isEuropeanClubCompetition(comp) ? "europe" : "national";
  const tiles = useTiles(tileScope);
  const [competitions, setCompetitions] = useState([]);
  const [tab, setTab] = useState("overview");
  const [seasons, setSeasons] = useState([]); const [seasonLabel, setSeasonLabel] = useState("");
  const [matches, setMatches] = useState([]);
  const [clubsMap, setClubsMap] = useState({});
  const [players, setPlayers] = useState([]); const [playerStats, setPlayerStats] = useState([]); const [playerMemberships, setPlayerMemberships] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [matchPlayerStats, setMatchPlayerStats] = useState([]);
  const [seasonLoading, setSeasonLoading] = useState(false); const [dataError, setDataError] = useState("");
  const [phase, setPhase] = useState(null); const [round, setRound] = useState("all");
  const [matchView, setMatchView] = useState("list");
  const matchViewChosen = useRef(false);
  const [selClub, setSelClub] = useState(null); const [posFilter, setPosFilter] = useState("all");
  const [anchor, setAnchor] = useState(null);
  const [nationsDivision, setNationsDivision] = useState("A");
  const competitionType = getCompetitionType(comp, matches);
  const isCup = competitionType === "cup";
  const isHybrid = competitionType === "hybrid";
  const isInternational = comp?.competition_scope === "international";
  const isNationsLeague = isNationsLeagueCompetition(comp);
  const statsConfig = useStatsSections(comp?.id);
  useEffect(() => { if (!matchViewChosen.current && window.matchMedia("(max-width: 639px)").matches) setMatchView("calendar"); }, []);
  const chooseMatchView = (next) => { matchViewChosen.current = true; setMatchView(next); };
  useEffect(() => { if (tab === "stats" && anchor) { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); setAnchor(null); } }, [tab, anchor]);
  const goStats = (sec) => { setTab("stats"); setAnchor(sec); };

  const TABS = [["overview", L("comp.tab.overview", "Vue d'ensemble")], ["matchs", L("nav.matchs", "Matchs")], ["classement", isHybrid ? "Classement & tableau" : isCup ? L("cup.bracket", "Tableau") : L("nav.classement", "Classement")], ["clubs", isInternational ? "Sélections" : L("nav.clubs", "Clubs")], ["joueurs", L("nav.joueurs", "Joueurs")], ["stats", L("comp.tab.stats", "Stats")]];

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (["overview", "matchs", "classement", "clubs", "joueurs", "stats"].includes(requestedTab)) setTab(requestedTab);
  }, [searchParams]);

  useEffect(() => { (async () => {
    setDataError("");
    setPlayerStats([]);
    setMatchPlayerStats([]);
    const { data: competitionRows, error: competitionError } = await supabase.from("competitions").select("*");
    if (competitionError) throw competitionError;
    setCompetitions([...(competitionRows || [])].filter((item) => item.public_visible !== false).sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (a.name || "").localeCompare(b.name || "")));
    const c = resolveCompetitionRoute(competitionRows || [], slug);
    if (!c) { setComp(null); return; }
    setComp(c);
    const se = await supabase.from("seasons").select("*").eq("competition_id", c.id);
    if (se.error) throw se.error;
    const orderedSeasons = sortPublicSeasons(se.data || []);
    setSeasons(orderedSeasons); setSeasonLabel(orderedSeasons[0]?.label || "");
  })().catch(() => setComp(null)); }, [slug]);

  const activeSeason = seasons.find((season) => season.label === seasonLabel) || null;
  useEffect(() => { if (!comp?.id || (seasons.length && !activeSeason)) return; let alive = true; (async () => {
    setSeasonLoading(true); setDataError(""); setMatches([]); setClubsMap({}); setPlayers([]); setPlayerStats([]); setPlayerMemberships([]); setTransfers([]); setMatchPlayerStats([]); setPhase(null); setRound("all");
    const seasonMatches = await loadSeasonMatches(supabase, comp.id, activeSeason?.id);
    const clubMap = await loadClubsForMatches(supabase, seasonMatches);
    let statsQuery = supabase.from("player_season_stats").select(PUBLIC_PLAYER_STATS_FIELDS).eq("competition_id", comp.id);
    const activeYear = seasonKey(activeSeason?.label);
    if (activeYear) statsQuery = statsQuery.ilike("season", `${activeYear}%`);
    const statsResult = await statsQuery;
    if (statsResult.error) throw statsResult.error;
    const statsRows = preferAssignedPlayerStats(statsResult.data || []);
    const clubIds = Object.keys(clubMap);
    let membershipRows = [];
    if (activeYear && clubIds.length) {
      const membershipResult = await supabase.from("player_team_seasons")
        .select("player_id,club_id,position,shirt_number,squad_role,membership_type,is_primary,active,season_start_year")
        .eq("season_start_year", Number(activeYear))
        .eq("active", true)
        .in("club_id", clubIds);
      if (membershipResult.error) throw membershipResult.error;
      membershipRows = membershipResult.data || [];
    }
    const playerIds = [...new Set([
      ...statsRows.map((row) => row.player_id),
      ...membershipRows.map((row) => row.player_id),
    ].filter(Boolean))];
    let playerRows = playerIds.length ? await loadPlayersByIds(supabase, playerIds) : [];
    if (!playerRows.length && clubIds.length) {
      const fallback = await supabase.from("players").select(PUBLIC_PLAYER_FIELDS).in("club_id", clubIds).order("name");
      if (fallback.error) throw fallback.error;
      playerRows = fallback.data || [];
    }
    const exactMatchStats = await loadMatchStatsForMatches(supabase, seasonMatches.map((match) => match.id));
    const transferResult = activeYear
      ? await supabase.from("player_transfers").select("id,player_id,player_name,from_club_id,to_club_id,from_club_name,to_club_name,transfer_date,transfer_type").eq("season_start_year", Number(activeYear)).order("transfer_date", { ascending: false }).limit(100)
      : { data: [] };
    const competitionClubIds = new Set(clubIds);
    const transferRows = transferResult.error ? [] : (transferResult.data || []).filter((transfer) => competitionClubIds.has(transfer.from_club_id) || competitionClubIds.has(transfer.to_club_id)).slice(0, 5);
    if (!alive) return;
    setMatches(seasonMatches); setClubsMap(clubMap); setPlayers(playerRows); setPlayerStats(statsRows); setPlayerMemberships(membershipRows); setTransfers(transferRows); setMatchPlayerStats(exactMatchStats); setSeasonLoading(false);
  })().catch((loadError) => { if (alive) { setSeasonLoading(false); setDataError(loadError.message || String(loadError)); } }); return () => { alive = false; }; }, [comp?.id, activeSeason, seasons.length]);

  const pss = useMemo(() => {
    const activeSeason = seasonKey(seasonLabel);
    const rows = activeSeason ? playerStats.filter((stat) => seasonKey(stat.season) === activeSeason) : playerStats;
    const seasonTotals = statsByPlayer(rows);
    const matchTotals = matchStatsByPlayer(matchPlayerStats);
    // Les statistiques agrégées de l'endpoint joueurs restent prioritaires.
    // En coupes européennes, le détail des matchs déjà complétés alimente
    // néanmoins les leaders si l'agrégat d'un joueur manque encore.
    return { ...matchTotals, ...seasonTotals };
  }, [playerStats, matchPlayerStats, seasonLabel]);
  const seasonMatches = matches;
  const phases = useMemo(() => competitionPhases(seasonMatches, competitionType), [seasonMatches, competitionType]);
  const primaryPhase = (isCup ? phases[phases.length - 1] : phases[0]) || null;
  const curPhase = phase && phases.includes(phase) ? phase : primaryPhase;
  const phaseIsKnockout = isCup || (isHybrid && isKnockoutPhase(curPhase));
  const knockoutPhases = useMemo(() => phases.filter(isKnockoutPhase), [phases]);
  const phaseMatches = useMemo(() => seasonMatches.filter((m) => (m.phase || "—") === curPhase), [seasonMatches, curPhase]);
  const nationsGroups = useMemo(() => isNationsLeague ? nationsLeagueGroups(comp, seasonLabel, seasonMatches, clubsMap) : [], [isNationsLeague, comp, seasonLabel, seasonMatches, clubsMap]);
  const nationsDivisions = useMemo(() => [...new Set(nationsGroups.map((group) => group.division).filter(Boolean))].sort(), [nationsGroups]);
  useEffect(() => {
    if (!nationsDivisions.length) return;
    setNationsDivision((current) => nationsDivisions.includes(current) ? current : nationsDivisions.includes("A") ? "A" : nationsDivisions[0]);
  }, [nationsDivisions]);
  const zones = zonesForPhase(comp, activeSeason, curPhase, primaryPhase);
  const phaseFinished = phaseMatches.filter((m) => m.status === "finished" && m.home_score != null);
  const standings = useMemo(() => phaseIsKnockout ? [] : computeStandings(phaseFinished), [phaseFinished, phaseIsKnockout]);
  const rounds = useMemo(() => { const seen = new Map(); for (const m of phaseMatches) { const k = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); if (!seen.has(k)) seen.set(k, { key: k, num: m.round_number, label: m.round_number != null ? `${L("comp.round", "Journée")} ${m.round_number}` : (m.round_raw || "Tour") }); } return [...seen.values()].sort((a, b) => (a.num ?? 999) - (b.num ?? 999)); }, [phaseMatches]);
  const shownMatches = round === "all" ? phaseMatches : phaseMatches.filter((m) => (m.round_number != null ? String(m.round_number) : (m.round_raw || "?")) === round);
  const grouped = useMemo(() => { const g = {}; for (const m of shownMatches) { const k = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); (g[k] ||= { label: m.round_number != null ? `${L("comp.round", "Journée")} ${m.round_number}` : (m.round_raw || "Tour"), num: m.round_number, items: [] }).items.push(m); } return Object.values(g).sort((a, b) => (a.num ?? 999) - (b.num ?? 999)); }, [shownMatches]);

  const clubName = (id) => clubsMap[id]?.name || "—";
  const playerClubId = (player) => pss[player.id] ? (pss[player.id].club_id || null) : (player.club_id || null);
  const visiblePlayers = Object.keys(pss).length ? players.filter((player) => pss[player.id] && (Number(pss[player.id].appearances) || 0) > 0) : players;
  const membershipByPlayer = useMemo(() => new Map(playerMemberships.map((row) => [row.player_id, row])), [playerMemberships]);
  const rosterPlayers = playerMemberships.length ? players.filter((player) => membershipByPlayer.has(player.id)) : visiblePlayers;
  const rosterClubId = (player) => membershipByPlayer.get(player.id)?.club_id || playerClubId(player);
  const withStats = visiblePlayers.map((p) => ({ p, st: pss[p.id] })).filter((x) => x.st);
  const topBy = (key) => withStats.filter((x) => x.st[key] != null).sort((a, b) => (b.st[key] || 0) - (a.st[key] || 0)).slice(0, 10);
  const maxApp = Math.max(0, ...withStats.map((x) => x.st.appearances || 0));
  const ratingThreshold = comp?.rating_min ?? Math.max(5, Math.round(maxApp * 0.4));
  const topRating = withStats.filter((x) => x.st.rating != null && (x.st.appearances || 0) >= ratingThreshold).sort((a, b) => b.st.rating - a.st.rating).slice(0, 10);

  if (comp === undefined) return <p className="text-muted">Chargement…</p>;
  if (comp === null) return <p className="text-muted">Compétition introuvable.</p>;
  const seasonClubIds = new Set(seasonMatches.flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean));
  const clubsList = Object.values(clubsMap).filter((club) => seasonClubIds.has(club.id));
  const europeanClubCompetition = isEuropeanClubCompetition(comp);
  const partialCompetition = comp.ext?.imported_for === "national-teams" && !comp.ext?.full_competition_seasons?.[seasonLabel];
  const zoneFor = (pos) => zoneAt(zones, pos);

  const goals = phaseFinished.reduce((s, m) => s + m.home_score + m.away_score, 0);
  let homeW = 0, draw = 0, awayW = 0;
  phaseFinished.forEach((m) => { if (m.home_score > m.away_score) homeW++; else if (m.home_score === m.away_score) draw++; else awayW++; });
  const maxPlayed = Math.max(0, ...standings.map((r) => r.played));
  const eligible = standings.filter((r) => r.played >= Math.max(3, maxPlayed * 0.5));
  const bestAtk = [...eligible].sort((a, b) => b.gf - a.gf)[0];
  const bestDef = [...eligible].sort((a, b) => a.ga - b.ga)[0];
  const inForm = standings.map((r) => ({ club: r.club, res: clubForm(phaseFinished, r.club) })).map((r) => ({ ...r, pts: r.res.filter((x) => x === "V").length * 3 + r.res.filter((x) => x === "N").length })).sort((a, b) => b.pts - a.pts)[0];
  const topScorer = topBy("goals")[0]; const topAssist = topBy("assists")[0];

  // Priorité aux performances par match : on sait alors quel gardien a réellement joué.
  // Tant que le job Compositions n'a rien importé, l'ancienne heuristique reste le fallback.
  const phaseMatchIds = new Set(phaseFinished.map((match) => match.id));
  const exactKeeperRows = matchPlayerStats.filter((row) => phaseMatchIds.has(row.match_id) && row.player_id && row.starter && /^(g|gk|goalkeeper|gardien)$/i.test(row.position || "") && (row.minutes || 0) > 0 && row.goals_conceded === 0);
  const csMap = {};
  for (const m of phaseFinished) { if (m.away_score === 0 && m.home_club_id) csMap[m.home_club_id] = (csMap[m.home_club_id] || 0) + 1; if (m.home_score === 0 && m.away_club_id) csMap[m.away_club_id] = (csMap[m.away_club_id] || 0) + 1; }
  const exactCsMap = exactKeeperRows.reduce((acc, row) => ({ ...acc, [row.player_id]: (acc[row.player_id] || 0) + 1 }), {});
  const exactCleanSheets = Object.entries(exactCsMap).map(([playerId, v]) => {
    const p = players.find((player) => player.id === playerId);
    return p ? { p, st: { cs: v }, v } : null;
  }).filter(Boolean).sort((a, b) => b.v - a.v).slice(0, 10);
  const estimatedCleanSheets = Object.entries(csMap).map(([club, v]) => {
    const gks = visiblePlayers.filter((p) => playerClubId(p) === club && p.position === "Goalkeeper");
    if (!gks.length) return null;
    const gk = gks.map((p) => ({ p, min: pss[p.id]?.minutes || 0 })).sort((a, b) => b.min - a.min)[0].p;
    return { p: gk, st: { cs: v }, v };
  }).filter(Boolean).sort((a, b) => b.v - a.v).slice(0, 10);
  const gkCleanSheets = exactCleanSheets.length ? exactCleanSheets : estimatedCleanSheets;
  const topCS = gkCleanSheets[0];

  const lastRound = Math.max(-1, ...phaseFinished.map((m) => m.round_number ?? -1));
  const lastResults = lastRound >= 0 ? phaseMatches.filter((m) => (m.round_number ?? -1) === lastRound) : [...phaseFinished].sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 10);
  const nextRound = Math.min(Infinity, ...phaseMatches.filter((m) => m.status !== "finished" && m.round_number != null).map((m) => m.round_number));
  const upcoming = Number.isFinite(nextRound) ? phaseMatches.filter((m) => m.round_number === nextRound) : [...seasonMatches].filter((m) => m.status !== "finished").sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0)).slice(0, 10);
  const allFinished = seasonMatches.length > 0 && seasonMatches.every((m) => m.status === "finished");

  const clubHref = (id) => `/clubs/${id}?season=${encodeURIComponent(seasonLabel)}`;
  const ClubChip = ({ id }) => <Link href={clubHref(id)} className="inline-flex min-w-0 items-center gap-2 hover:text-accent">{clubsMap[id]?.logo_url && <img src={clubsMap[id].logo_url} className="h-5 w-5 shrink-0 object-contain" alt="" />}<span className="truncate">{clubName(id)}</span></Link>;

  const Card = ({ title, onSee, children, bgKey, className = "" }) => {
    const t = bgKey ? tiles(bgKey) : null;
    const style = { ...(t?.background_url ? { backgroundImage: `url(${t.background_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}), ...(t?.border_color ? { borderColor: t.border_color } : {}) };
    return (
      <div className={`relative flex h-full flex-col overflow-hidden rounded-2xl border border-line/10 p-4 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.8)] ${t?.background_url ? "" : "bg-gradient-to-b from-surface to-bg/40"} ${className}`} style={style}>
        {t?.background_url && <span className="absolute inset-0" style={{ background: `rgba(0,0,0,${t.overlay ?? 0.5})` }} />}
        {t?.wm && !t?.background_url && <span className="pointer-events-none absolute -bottom-4 -right-2 select-none text-7xl opacity-[0.06]">{t.wm}</span>}
        <div className="relative mb-3 flex shrink-0 items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-content/90">{title}</div>
          {onSee && <button onClick={onSee} className="text-xs font-semibold text-accent hover:underline">{L("comp.seeall", "Voir tout")} →</button>}
        </div>
        <div className="relative flex-1">{children}</div>
      </div>
    );
  };

  const LeaderCard = ({ title, x, unit, meta, onClick, variant }) => {
    const v = VARIANTS[variant]; const t = tiles(variant);
    const on = t.enabled !== false;
    const accent = (on && t.accent) || v.accent;
    const bg = on ? t.background_url : null;
    const style = { ...(bg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" } : {}), ...(on ? { borderColor: t.border_color || accent } : {}) };
    return (
      <button onClick={onClick} className={`relative w-full overflow-hidden rounded-2xl border p-4 text-left transition hover:brightness-110 ${on ? v.glow : "border-line/10"} ${on && !bg ? `bg-gradient-to-br ${v.grad} to-transparent` : (bg ? "" : "bg-surface")}`} style={style}>
        {bg && <span className="absolute inset-0" style={{ background: `rgba(0,0,0,${t.overlay ?? 0.55})` }} />}
        {on && <span className="pointer-events-none absolute -bottom-3 -right-2"><Watermark kind={v.wm} color={accent} /></span>}
        <div className="relative">
          <div className="text-xs font-bold uppercase tracking-wider text-muted">{v.icon} {title}</div>
          {x ? (
            <div className="mt-2 flex items-center gap-3">
              <img src={x.p.photo_url || ""} className="h-14 w-14 rounded-full object-cover ring-2" style={{ "--tw-ring-color": accent }} alt="" />
              <span className="min-w-0"><b className="block truncate">{x.p.name}</b><span className="flex items-center gap-1 text-xs text-muted">{clubsMap[playerClubId(x.p)]?.logo_url && <img src={clubsMap[playerClubId(x.p)].logo_url} className="h-3.5 w-3.5 object-contain" alt="" />}{clubName(playerClubId(x.p))}</span>{meta && <span className="block text-[11px] text-muted/70">{meta(x.st)}</span>}</span>
              <b className="ml-auto text-2xl" style={{ color: accent }}>{unit}</b>
            </div>
          ) : <p className="mt-2 text-sm text-muted">—</p>}
        </div>
      </button>
    );
  };

  const FormDots = ({ res }) => <span className="hidden gap-0.5 sm:flex">{res.map((r, i) => <span key={i} className={`h-2 w-2 rounded-full ${r === "V" ? "bg-green-400" : r === "N" ? "bg-white/25" : "bg-red-400"}`} title={r} />)}</span>;
  const PhaseChips = () => phases.length > 1 ? <><select value={curPhase || ""} onChange={(event) => { setPhase(event.target.value); setRound("all"); }} className="mb-4 w-full rounded-xl border border-line/10 bg-surface px-3 py-2 text-sm sm:hidden">{phases.map((ph) => <option key={ph}>{ph}</option>)}</select><div className="mb-4 hidden flex-wrap gap-1 sm:flex">{phases.map((ph) => <button key={ph} onClick={() => { setPhase(ph); setRound("all"); }} className={`rounded-full border px-3 py-1 text-xs ${curPhase === ph ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{ph}</button>)}</div></> : null;

  function TopCategory({ title, id, rows, fmt, meta, accent = "#ef4444" }) {
    if (!rows.length) return <div id={id} className="h-full rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/35 p-4"><h3 className="mb-2 font-bold" style={{ color: accent }}>{title}</h3><p className="text-sm text-muted">—</p></div>;
    const [a, b, c, ...rest] = rows;
    const Sub = ({ cid }) => <span className="flex items-center gap-1 text-[11px] text-muted">{clubsMap[cid]?.logo_url && <img src={clubsMap[cid].logo_url} className="h-3.5 w-3.5 object-contain" alt="" />}{clubName(cid)}</span>;
    const Med = ({ x, tone, ring }) => <Link href={`/players/${x.p.id}`} className={`flex items-center gap-2 rounded-xl border p-2 ${tone}`}><img src={x.p.photo_url || ""} className={`h-9 w-9 rounded-full object-cover ring-1 ${ring}`} alt="" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{x.p.name}</span><Sub cid={playerClubId(x.p)} /></span><b>{fmt(x.st)}</b></Link>;
    return (
      <div id={id} className="h-full rounded-2xl border bg-gradient-to-b from-surface to-bg/35 p-4 shadow-[0_18px_45px_-34px_rgba(0,0,0,0.95)]" style={{ borderColor: `${accent}45` }}>
        <div className="mb-3 flex items-center gap-2"><span className="h-4 w-1 rounded-full" style={{ background: accent }} /><h3 className="font-black">{title}</h3></div>
        <Link href={`/players/${a.p.id}`} className="mb-2 flex items-center gap-3 rounded-2xl border p-3 transition hover:brightness-110" style={{ borderColor: `${accent}60`, background: `${accent}12` }}>
          <img src={a.p.photo_url || ""} className="h-14 w-14 rounded-full object-cover ring-2" style={{ "--tw-ring-color": `${accent}90` }} alt="" />
          <span className="min-w-0 flex-1"><span className="block truncate font-black">{a.p.name}</span><Sub cid={playerClubId(a.p)} />{meta && <span className="block text-[11px] text-muted/70">{meta(a.st)}</span>}</span>
          <b className="text-2xl" style={{ color: accent }}>{fmt(a.st)}</b>
        </Link>
        {(b || c) && <div className="mb-2 grid grid-cols-2 gap-2">{b && <Med x={b} tone="border-slate-300/25 bg-slate-300/5" ring="ring-slate-300/40" />}{c && <Med x={c} tone="border-amber-700/30 bg-amber-700/5" ring="ring-amber-700/40" />}</div>}
        {rest.length > 0 && <ol className="space-y-1 text-sm">{rest.map((x, i) => <li key={x.p.id} className="flex items-center gap-2"><span className="w-4 text-muted">{i + 4}</span><Link href={`/players/${x.p.id}`} className="min-w-0 flex-1 truncate hover:text-accent">{x.p.name}</Link><b>{fmt(x.st)}</b></li>)}</ol>}
      </div>
    );
  }

  function StatsBlock({ section }) {
    if (section.key === "overview") return (
      <div className="sm:col-span-2 lg:col-span-3">
        <div className="mb-3 flex items-center gap-2"><span className="h-4 w-1 rounded-full" style={{ background: section.accent }} /><h3 className="font-black">{section.label}</h3></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [phaseFinished.length, L("stat.played", "Matchs joués")],
            [goals, L("stat.goals", "Buts")],
            [phaseFinished.length ? (goals / phaseFinished.length).toFixed(2) : "0", L("stat.avg", "Buts / match")],
            [`${homeW}/${draw}/${awayW}`, L("stat.hda", "Dom/Nul/Ext")],
          ].map(([value, label]) => <div key={label} className="relative overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-br from-surface to-bg/45 p-4"><span className="absolute inset-y-0 left-0 w-1" style={{ background: section.accent }} /><div className="text-2xl font-black">{value}</div><div className="mt-1 text-xs text-muted">{label}</div></div>)}
        </div>
      </div>
    );
    const props = {
      scorers: { id: "buteurs", rows: topBy("goals"), fmt: (stat) => stat.goals },
      assists: { id: "passeurs", rows: topBy("assists"), fmt: (stat) => stat.assists },
      clean_sheets: { id: "cleansheets", rows: gkCleanSheets, fmt: (stat) => stat.cs, meta: () => "gardien" },
      minutes: { id: "minutes", rows: topBy("minutes"), fmt: (stat) => stat.minutes },
      lineups: { id: "titu", rows: topBy("lineups"), fmt: (stat) => stat.lineups },
      ratings: { id: "notes", rows: topRating, fmt: (stat) => stat.rating?.toFixed?.(2) ?? stat.rating, meta: (stat) => `${stat.appearances || 0} app · ${stat.minutes || 0} min` },
    }[section.key];
    return props ? <TopCategory {...props} title={section.label} accent={section.accent} /> : null;
  }

  return (
    <div className="relative">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0" style={{ background: "radial-gradient(1100px 520px at 50% -120px, rgba(36,92,180,0.16), transparent 70%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(760px 420px at 100% 110%, rgba(18,48,110,0.14), transparent 70%)" }} />
      </div>
      <Link href={`/competitions?univers=${tileScope}`} className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-muted transition hover:text-content">← {tileScope === "national" ? "Compétitions belges" : tileScope === "europe" ? "Coupes d’Europe" : "Compétitions internationales"}</Link>
      <CompetitionHeader comp={comp} seasonLabel={seasonLabel} kicker={L("comp.kicker", "Compétitions")} />
      {competitions.length > 1 && (
        <div className="-mt-2 mb-5 flex justify-center">
          <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line/10 bg-surface2/80 p-1 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.9)] backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {competitions.map((item) => {
              const active = item.id === comp.id;
              return <Link key={item.id} href={`${competitionPath(item)}?tab=${tab}`} aria-current={active ? "page" : undefined} className={`group flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition sm:px-4 ${active ? "bg-accent text-white shadow-[0_5px_18px_-8px_rgba(239,68,68,0.9)]" : "text-muted hover:bg-white/[0.05] hover:text-content"}`}>{item.logo_url && <img src={item.logo_url} className="h-5 w-5 object-contain" alt="" />}<span>{formatCompetitionName(item.header_title?.trim() || item.name)}</span></Link>;
            })}
          </div>
        </div>
      )}
      <div className="mb-6 border-b border-line/10">
        <div className="flex items-center gap-2">
          <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><div className="flex w-max gap-1">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`shrink-0 px-3 py-2 text-sm ${tab === k ? "border-b-2 border-accent font-bold text-content" : "text-muted hover:text-content"}`}>{l}</button>)}</div></div>
          {seasons.length > 0 && <select value={seasonLabel} onChange={(e) => { setSeasonLabel(e.target.value); setPhase(null); setRound("all"); }} className="hidden shrink-0 rounded border border-line/10 bg-surface px-2 py-1 text-xs sm:block">{seasons.map((s) => <option key={s.id}>{s.label}</option>)}</select>}
        </div>
        {seasons.length > 0 && <select value={seasonLabel} onChange={(e) => { setSeasonLabel(e.target.value); setPhase(null); setRound("all"); }} className="mb-3 mt-2 w-full rounded-xl border border-line/10 bg-surface px-3 py-2 text-sm sm:hidden">{seasons.map((s) => <option key={s.id}>{s.label}</option>)}</select>}
      </div>

      {dataError && <p className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Impossible de charger les données de cette saison : {dataError}</p>}
      {partialCompetition && <p className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm leading-6 text-amber-100"><b>Données partielles.</b> Seuls les matchs de la sélection belge suivie sont importés pour le moment. Le classement et le tableau complets apparaîtront après la synchronisation de base de cette compétition.</p>}
      {seasonLoading && <div className="h-72 animate-pulse rounded-3xl bg-surface" />}

      {!seasonLoading && tab === "overview" && (
        <div className="space-y-6">
          <div className={`grid gap-4 ${europeanClubCompetition ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
            {partialCompetition ? (
              <Card title="Import en préparation">
                <div className="flex h-full flex-col justify-center rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                  <div className="text-lg font-black text-amber-200">Vue volontairement limitée</div>
                  <p className="mt-2 text-xs leading-5 text-muted">Belfoot affiche les matchs déjà connus, sans fabriquer de classement à partir d'un sous-ensemble incomplet.</p>
                </div>
              </Card>
            ) : isNationsLeague && nationsGroups.length ? (
              <Card title={`Classements — Ligue ${nationsDivision}`} onSee={() => setTab("classement")}>
                <NationsLeagueStandings groups={nationsGroups} clubs={clubsMap} division={nationsDivision} onDivisionChange={setNationsDivision} compact />
              </Card>
            ) : phaseIsKnockout ? (
              <Card title={L("cup.currentRound", "Tour sélectionné")} onSee={() => setTab("classement")}>
                <div className="flex h-full flex-col justify-center rounded-xl border border-accent/15 bg-accent/5 p-4">
                  <div className="text-2xl font-black">{curPhase || "—"}</div>
                  <div className="mt-2 flex gap-4 text-xs text-muted"><span><b className="text-content">{phaseMatches.length}</b> matchs</span><span><b className="text-content">{phaseFinished.length}</b> terminés</span></div>
                  <p className="mt-3 text-xs text-muted">{L("cup.noPointsShort", "Format à élimination directe, sans classement à points.")}</p>
                </div>
              </Card>
            ) : (
              <Card title={europeanClubCompetition ? L("nav.classement", "Classement") : L("comp.top5", "Classement — Top 5")} onSee={() => setTab("classement")} className={europeanClubCompetition ? "lg:col-span-2" : ""}>
                <div className="flex h-full flex-col">
                  <div className={europeanClubCompetition ? "grid flex-1 gap-1.5 md:grid-cols-2 xl:grid-cols-3" : "flex flex-1 flex-col justify-between gap-1"}>
                  {standings.slice(0, europeanClubCompetition ? standings.length : 5).map((r, i) => { const z = zoneFor(i + 1); return (
                    <div key={r.club} className={`group flex min-w-0 items-center gap-2 rounded-xl border px-2 py-1.5 transition ${europeanClubCompetition && isBelgianClubCountry(clubsMap[r.club]?.ext?.country) ? "border-amber-300/45 bg-gradient-to-r from-red-500/15 via-amber-300/[0.08] to-transparent shadow-[inset_3px_0_0_rgba(252,211,77,.8)]" : "border-white/[0.035] bg-gradient-to-r from-white/[0.045] to-transparent hover:border-accent/20 hover:bg-white/[0.06]"}`}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-black" style={z ? { borderColor: `${z.color}80`, background: `${z.color}22`, color: z.color } : { borderColor: "rgba(148,163,184,0.5)", background: "rgba(148,163,184,0.2)", color: "rgb(226,232,240)" }}>{i + 1}</span>
                      {clubsMap[r.club]?.logo_url && <img src={clubsMap[r.club].logo_url} className="h-6 w-6 shrink-0 object-contain" alt="" />}
                      <Link href={clubHref(r.club)} className="min-w-0 flex-1 truncate font-semibold hover:text-accent">{clubName(r.club)}</Link>
                      {europeanClubCompetition && isBelgianClubCountry(clubsMap[r.club]?.ext?.country) && <span className="shrink-0 text-xs" title="Club belge">🇧🇪</span>}
                      <FormDots res={clubForm(phaseFinished, r.club)} />
                      <b className="min-w-9 rounded-lg bg-white/[0.06] px-1.5 py-1 text-center tabular-nums">{r.pts}</b>
                    </div>); })}
                  {standings.length === 0 && <p className="text-muted">—</p>}
                  </div>
                  {zones.length > 0 && <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 border-t border-line/10 pt-2 text-[10px] text-muted">{zones.map((z, i) => <span key={i} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: z.color }} />{z.label}</span>)}</div>}
                </div>
              </Card>
            )}
            <Card title={phaseIsKnockout ? `${L("comp.results", "Résultats")} — ${curPhase || L("cup.round", "Tour")}` : (lastRound >= 0 ? `${L("comp.results", "Résultats")} — ${L("comp.round", "Journée")} ${lastRound}` : L("comp.results", "Derniers résultats"))} onSee={() => setTab("matchs")}>
              <div className="space-y-1.5">{lastResults.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} compact />)}{lastResults.length === 0 && <p className="text-sm text-muted">—</p>}</div>
            </Card>
            <Card title={!phaseIsKnockout && Number.isFinite(nextRound) ? `${L("comp.upcoming", "Prochaine journée")} — J${nextRound}` : L("comp.upcoming", "Prochains matchs")} onSee={() => setTab("matchs")} bgKey="upcoming">
              {upcoming.length ? <div className="space-y-1.5">{upcoming.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} compact />)}</div>
                : <div className="flex flex-col items-center gap-2 py-10 text-muted"><Calendar className="h-6 w-6" /><span className="text-sm">{allFinished ? L("empty.season", "Saison terminée") : L("empty.upcoming", "Aucun match à venir")}</span></div>}
            </Card>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted"><span className="h-3 w-1 rounded bg-accent" />{L("comp.leaders", "Les leaders")}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <LeaderCard title={L("comp.topscorer", "Meilleur buteur")} x={topScorer} unit={topScorer?.st.goals} onClick={() => goStats("buteurs")} variant="topscorer" />
              <LeaderCard title={L("comp.topassist", "Meilleur passeur")} x={topAssist} unit={topAssist?.st.assists} onClick={() => goStats("passeurs")} variant="topassist" />
              <LeaderCard title={L("comp.cleansheets", "Clean sheets")} x={topCS} unit={topCS?.v} onClick={() => goStats("cleansheets")} variant="cleansheet" />
            </div>
            {!withStats.length && <p className="mt-2 rounded-xl border border-dashed border-line/15 bg-surface/30 px-3 py-2 text-xs text-muted">Les fonds personnalisés restent visibles. Les noms et chiffres apparaîtront après l’import des effectifs et des statistiques.</p>}
          </div>

          {transfers.length > 0 && <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted"><span className="h-3 w-1 rounded bg-accent" />Top 5 transferts · {seasonLabel}</div>
            <div className="grid gap-2 lg:grid-cols-5">
              {transfers.map((transfer) => <Link key={transfer.id} href={transfer.player_id ? `/players/${transfer.player_id}` : "#"} className="rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-3 transition hover:border-accent/40">
                <div className="truncate text-sm font-black">{transfer.player_name}</div>
                <div className="mt-2 flex items-center gap-1 text-[11px] text-muted"><span className="min-w-0 flex-1 truncate">{transfer.from_club_name || "Libre"}</span><span className="shrink-0 text-accent">→</span><span className="min-w-0 flex-1 truncate text-right text-content">{transfer.to_club_name || "Libre"}</span></div>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-line/10 pt-2 text-[10px] text-muted"><span>{new Date(`${transfer.transfer_date}T12:00:00`).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}</span>{transfer.transfer_type && <span className="max-w-[60%] truncate rounded-full bg-white/[0.05] px-2 py-0.5">{transfer.transfer_type}</span>}</div>
              </Link>)}
            </div>
          </div>}

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted"><span className="h-3 w-1 rounded bg-accent" />{L("comp.otherstats", "Autres statistiques")}</div>
            {phaseIsKnockout ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("cup.roundMatches", "Matchs du tour")}</div><b className="mt-2 block text-2xl">{phaseMatches.length}</b></div>
                <div className="rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("cup.roundGoals", "Buts du tour")}</div><b className="mt-2 block text-2xl">{goals}</b></div>
                <button onClick={() => setTab("classement")} className="rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4 text-left transition hover:border-accent/40"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("cup.allRounds", "Tous les tours")}</div><b className="mt-2 block text-2xl">{phases.length}</b></button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <Link href={inForm ? clubHref(inForm.club) : "#"} className="block rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4 transition hover:border-accent/40"><div className="text-xs font-bold uppercase tracking-wider text-muted">🔥 {isInternational ? "Sélection en forme" : L("comp.inform", "Club en forme")}</div>{inForm ? <div className="mt-2"><ClubChip id={inForm.club} /><div className="mt-1 flex gap-1 text-xs">{inForm.res.map((r, i) => <span key={i} className={`rounded px-1 ${r === "V" ? "bg-green-500/20 text-green-400" : r === "N" ? "bg-white/10 text-muted" : "bg-red-500/20 text-red-400"}`}>{r}</span>)}</div></div> : <p className="mt-2 text-sm text-muted">—</p>}</Link>
                <button onClick={() => setTab("classement")} className="rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4 text-left transition hover:border-accent/40"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("stat.bestatk", "Meilleure attaque")}</div>{bestAtk ? <div className="mt-2 flex items-center justify-between"><ClubChip id={bestAtk.club} /><b className="text-xl">{bestAtk.gf}</b></div> : <p className="mt-2 text-sm text-muted">—</p>}</button>
                <button onClick={() => setTab("classement")} className="rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4 text-left transition hover:border-accent/40"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("stat.bestdef", "Meilleure défense")}</div>{bestDef ? <div className="mt-2 flex items-center justify-between"><ClubChip id={bestDef.club} /><b className="text-xl">{bestDef.ga}</b></div> : <p className="mt-2 text-sm text-muted">—</p>}</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-line/10 pt-4 text-center text-xs text-muted sm:grid-cols-4">
            <div><b className="block text-base text-content">{clubsList.length}</b>{isInternational ? "sélections" : L("nav.clubs", "clubs")}</div>
            <div><b className="block text-base text-content">{seasonMatches.length}</b>{L("nav.matchs", "matchs")}</div>
            <div><b className="block text-base text-content">{rosterPlayers.length}</b>{L("nav.joueurs", "joueurs")}</div>
            <div><b className="block text-base text-content">{seasons.length}</b>saisons</div>
          </div>
        </div>
      )}

      {!seasonLoading && tab === "matchs" && (
        <div>
          <PhaseChips />
          <div className="mb-4 flex sm:justify-end"><div className="inline-flex w-full rounded-xl border border-line/10 bg-surface p-1 sm:w-auto"><button onClick={() => chooseMatchView("calendar")} className={`order-1 flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold sm:order-2 sm:flex-none sm:py-1.5 ${matchView === "calendar" ? "bg-accent text-white" : "text-muted hover:text-content"}`}><CalendarDays className="h-3.5 w-3.5" />Calendrier</button><button onClick={() => chooseMatchView("list")} className={`order-2 flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold sm:order-1 sm:flex-none sm:py-1.5 ${matchView === "list" ? "bg-accent text-white" : "text-muted hover:text-content"}`}><List className="h-3.5 w-3.5" />Liste</button></div></div>
          {matchView === "calendar" ? <SeasonCalendar matches={phaseMatches} clubs={clubsMap} selectedRound={round} onRoundChange={setRound} /> : <>
            {rounds.length > 1 && <select value={round} onChange={(event) => setRound(event.target.value)} className="mb-4 w-full rounded-xl border border-line/10 bg-surface px-3 py-2 text-sm sm:hidden"><option value="all">{L("filter.allRounds", "Toutes les journées")}</option>{rounds.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>}
            {rounds.length > 1 && <div className="mb-4 hidden flex-wrap gap-1 sm:flex"><button onClick={() => setRound("all")} className={`rounded-full border px-3 py-1 text-xs ${round === "all" ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{L("filter.all", "Tout")}</button>{rounds.map((r) => <button key={r.key} onClick={() => setRound(r.key)} className={`rounded-full border px-3 py-1 text-xs ${round === r.key ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{r.num != null ? `J${r.num}` : r.label}</button>)}</div>}
            {grouped.map((g) => { const ds = g.items.map((m) => m.kickoff).filter(Boolean).sort(); const range = ds.length ? new Date(ds[0]).toLocaleDateString("fr-BE", { day: "numeric", month: "short" }) + (ds[0].slice(0, 10) !== ds[ds.length - 1].slice(0, 10) ? " – " + new Date(ds[ds.length - 1]).toLocaleDateString("fr-BE", { day: "numeric", month: "short" }) : "") : ""; return (<div key={g.label} className="mb-5"><div className="mb-2 flex items-baseline gap-2"><span className="text-xs font-bold uppercase tracking-wider text-muted">{g.label}</span>{range && <span className="text-[11px] text-muted/60">{range}</span>}</div><div className="space-y-2">{g.items.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}</div></div>); })}
            {shownMatches.length === 0 && <p className="text-muted">{L("empty.matches", "Aucun match.")}</p>}
          </>}
        </div>
      )}

      {!seasonLoading && tab === "classement" && (partialCompetition
        ? <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-6 text-center"><div className="font-black text-amber-200">Classement indisponible pendant l’import partiel</div><p className="mt-2 text-sm text-muted">Lance la synchronisation complète et contrôlée de la compétition depuis l’administration pour afficher toutes les équipes et tous les matchs.</p></div>
        : isNationsLeague && nationsGroups.length
        ? <div className="space-y-7"><NationsLeagueStandings groups={nationsGroups} clubs={clubsMap} division={nationsDivision} onDivisionChange={setNationsDivision} />{knockoutPhases.length > 0 && <section><h2 className="mb-3 text-sm font-black uppercase tracking-wider text-muted">Phase finale et barrages</h2><CupRounds matches={seasonMatches} clubs={clubsMap} phases={knockoutPhases} activePhase={knockoutPhases.includes(curPhase) ? curPhase : knockoutPhases[0]} onPhaseChange={(next) => { setPhase(next); setRound("all"); }} L={L} /></section>}</div>
        : isCup
        ? <CupRounds matches={seasonMatches} clubs={clubsMap} phases={phases} activePhase={curPhase} onPhaseChange={(next) => { setPhase(next); setRound("all"); }} L={L} />
        : isHybrid
          ? <div><PhaseChips />{phaseIsKnockout
            ? <CupRounds matches={seasonMatches} clubs={clubsMap} phases={knockoutPhases} activePhase={curPhase} onPhaseChange={(next) => { setPhase(next); setRound("all"); }} showPhaseSelector={false} L={L} />
            : <StandingsTable standings={standings} clubs={clubsMap} zones={zones} L={L} entityLabel={isInternational ? "Sélection" : null} />}</div>
          : <div><PhaseChips /><StandingsTable standings={standings} clubs={clubsMap} zones={zones} L={L} entityLabel={isInternational ? "Sélection" : null} /></div>)}

      {!seasonLoading && tab === "clubs" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clubsList.map((c) => { const belgian = europeanClubCompetition && String(c.ext?.country || "").toLowerCase() === "belgium"; return <Link key={c.id} href={clubHref(c.id)} className={`flex items-center gap-3 rounded-xl border bg-surface p-3 transition hover:border-accent/40 ${belgian ? "border-amber-300/35 ring-1 ring-amber-300/10" : "border-line/10"}`}>{c.logo_url && <img src={c.logo_url} className="h-8 w-8 object-contain" alt="" />}<span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>{belgian && <span className="shrink-0 rounded-full bg-amber-300/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-200">🇧🇪 Belge</span>}</Link>; })}
          {clubsList.length === 0 && <p className="text-muted">{isInternational ? "Aucune sélection." : L("empty.clubs", "Aucun club.")}</p>}
        </div>
      )}

      {!seasonLoading && tab === "joueurs" && (
        selClub === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[...clubsList].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
              <button key={c.id} onClick={() => { setSelClub(c.id); setPosFilter("all"); }} className="rounded-2xl border border-line/10 bg-surface p-4 text-center transition hover:border-accent/40">{c.logo_url && <img src={c.logo_url} className="mx-auto h-14 w-14 object-contain" alt="" />}<div className="mt-2 font-bold">{c.name}</div><div className="text-xs text-muted">{rosterPlayers.filter((p) => rosterClubId(p) === c.id).length} {L("nav.joueurs", "joueurs")}</div></button>
            ))}
            {clubsList.length === 0 && <p className="text-muted">{L("empty.players", "Aucun joueur.")}</p>}
          </div>
        ) : (() => {
          const POS_LABEL = { all: L("pos.all", "Tous"), Goalkeeper: L("pos.gk", "Gardiens"), Defender: L("pos.def", "Défenseurs"), Midfielder: L("pos.mid", "Milieux"), Attacker: L("pos.fwd", "Attaquants") };
          const roster = rosterPlayers.filter((p) => (selClub === "__none__" ? !rosterClubId(p) : rosterClubId(p) === selClub));
          const shown = roster.filter((p) => posFilter === "all" || (membershipByPlayer.get(p.id)?.position || p.position) === posFilter).sort((a, b) => (POS[membershipByPlayer.get(a.id)?.position || a.position] ?? 9) - (POS[membershipByPlayer.get(b.id)?.position || b.position] ?? 9) || (a.name || "").localeCompare(b.name || ""));
          return (
            <div>
              <div className="mb-3 flex items-center gap-3"><button onClick={() => setSelClub(null)} className="text-sm text-muted hover:text-content">← {isInternational ? "Sélections" : L("nav.clubs", "Clubs")}</button><span className="flex items-center gap-2 font-bold">{clubsMap[selClub]?.logo_url && <img src={clubsMap[selClub].logo_url} className="h-6 w-6 object-contain" alt="" />}{clubName(selClub)}</span></div>
              <div className="mb-4 flex flex-wrap gap-1">{["all", "Goalkeeper", "Defender", "Midfielder", "Attacker"].map((pf) => <button key={pf} onClick={() => setPosFilter(pf)} className={`rounded-full border px-3 py-1 text-xs ${posFilter === pf ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{POS_LABEL[pf]}</button>)}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((p) => { const age = playerAge(p); const membership = membershipByPlayer.get(p.id); const nationalities = nationalityBadges(p.nationality); return <Link key={p.id} href={`/players/${p.id}`} className="rounded-2xl border border-line/10 bg-surface p-3 text-center transition hover:border-accent/40"><img src={p.photo_url || ""} className="mx-auto h-16 w-16 rounded-full object-cover" alt="" /><div className="mt-2 truncate text-sm font-bold">{p.name}</div><div className="text-xs text-muted">{[membership?.position || p.position, age ? `${age} ans` : null].filter(Boolean).join(" · ")}</div>{nationalities.length > 0 && <div className="mt-1 flex justify-center gap-1">{nationalities.map((nationality) => nationality.flagUrl ? <img key={`${nationality.code}-${nationality.label}`} src={nationality.flagUrl} title={nationality.label} alt={nationality.label} className="h-3 w-4 rounded-[2px] object-cover" /> : <span key={nationality.label} title={nationality.label}>🌍</span>)}</div>}</Link>; })}
                {shown.length === 0 && <p className="text-muted">{L("empty.players", "Aucun joueur.")}</p>}
              </div>
            </div>
          );
        })()
      )}

      {!seasonLoading && tab === "stats" && (
        <div className="space-y-5">
          <PhaseChips />
          <div className="relative overflow-hidden rounded-3xl border border-line/10 bg-gradient-to-r from-surface to-bg/40 px-5 py-6 sm:px-7">
            <div className="absolute -right-12 -top-20 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative"><div className="text-[10px] font-bold uppercase tracking-[0.24em] text-accent">{seasonLabel}{curPhase ? ` · ${curPhase}` : ""}</div><h2 className="mt-1 text-2xl font-black sm:text-3xl">{statsConfig.title}</h2>{statsConfig.subtitle && <p className="mt-2 max-w-2xl text-sm text-muted">{statsConfig.subtitle}</p>}</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {statsConfig.sections.filter((section) => section.enabled).map((section) => <StatsBlock key={section.key} section={section} />)}
          </div>
        </div>
      )}
    </div>
  );
}
