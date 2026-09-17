"use client";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";
import StandingsTable from "@/components/football/StandingsTable";
import CupRounds from "@/components/football/CupRounds";
import CompetitionHeader from "@/components/football/CompetitionHeader";
import Watermark from "@/components/football/Watermark";
import { computeStandings } from "@/lib/standings";
import { competitionPhases, getCompetitionType } from "@/lib/competitionType";
import { competitionPath, resolveCompetitionRoute } from "@/lib/competitionRoutes";
import { useLabels } from "@/lib/labels";
import { useTiles } from "@/lib/tiles";
import { zoneAt, zonesForPhase } from "@/lib/standingsZones";
import { useStatsSections } from "@/lib/statsSections";

const POS = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };
const VARIANTS = {
  topscorer: { border: "border-amber-400/50", glow: "shadow-[0_0_34px_-12px_rgba(244,196,48,0.45)]", grad: "from-amber-400/10", accent: "#f4c430", wm: "ball", icon: "⚽" },
  topassist: { border: "border-red-500/50", glow: "shadow-[0_0_34px_-12px_rgba(239,68,68,0.45)]", grad: "from-red-500/10", accent: "#ef4444", wm: "boot", icon: "👟" },
  cleansheet: { border: "border-sky-400/50", glow: "shadow-[0_0_34px_-12px_rgba(56,189,248,0.45)]", grad: "from-sky-400/10", accent: "#38bdf8", wm: "glove", icon: "🧤" },
};
function seasonKey(value) { return (String(value || "").match(/\d{4}/) || [String(value || "")])[0]; }
function clubForm(ms, clubId) {
  const rel = ms.filter((m) => m.home_score != null && (m.home_club_id === clubId || m.away_club_id === clubId)).sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 5).reverse();
  const res = [];
  for (const m of rel) { const home = m.home_club_id === clubId; const gf = home ? m.home_score : m.away_score, ga = home ? m.away_score : m.home_score; res.push(gf > ga ? "V" : gf === ga ? "N" : "D"); }
  return res;
}

export default function CompetitionPage() {
  const { slug } = useParams();
  const searchParams = useSearchParams();
  const L = useLabels();
  const tiles = useTiles();
  const [comp, setComp] = useState(undefined);
  const [competitions, setCompetitions] = useState([]);
  const [tab, setTab] = useState("overview");
  const [seasons, setSeasons] = useState([]); const [seasonLabel, setSeasonLabel] = useState("");
  const [matches, setMatches] = useState([]);
  const [clubsMap, setClubsMap] = useState({});
  const [players, setPlayers] = useState([]); const [playerStats, setPlayerStats] = useState([]);
  const [phase, setPhase] = useState(null); const [round, setRound] = useState("all");
  const [selClub, setSelClub] = useState(null); const [posFilter, setPosFilter] = useState("all");
  const [anchor, setAnchor] = useState(null);
  const competitionType = getCompetitionType(comp, matches);
  const isCup = competitionType === "cup";
  const statsConfig = useStatsSections(comp?.id);
  useEffect(() => { if (tab === "stats" && anchor) { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); setAnchor(null); } }, [tab, anchor]);
  const goStats = (sec) => { setTab("stats"); setAnchor(sec); };

  const TABS = [["overview", L("comp.tab.overview", "Vue d'ensemble")], ["matchs", L("nav.matchs", "Matchs")], ["classement", isCup ? L("cup.rounds", "Tours") : L("nav.classement", "Classement")], ["clubs", L("nav.clubs", "Clubs")], ["joueurs", L("nav.joueurs", "Joueurs")], ["stats", L("comp.tab.stats", "Stats")]];

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (["overview", "matchs", "classement", "clubs", "joueurs", "stats"].includes(requestedTab)) setTab(requestedTab);
  }, [searchParams]);

  useEffect(() => { (async () => {
    setPlayerStats([]);
    const { data: competitionRows, error: competitionError } = await supabase.from("competitions").select("*");
    if (competitionError) throw competitionError;
    setCompetitions([...(competitionRows || [])].filter((item) => item.public_visible !== false).sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (a.name || "").localeCompare(b.name || "")));
    const c = resolveCompetitionRoute(competitionRows || [], slug);
    if (!c) { setComp(null); return; }
    setComp(c);
    const [se, ma] = await Promise.all([
      supabase.from("seasons").select("*").eq("competition_id", c.id),
      supabase.from("matches").select("*").eq("competition_id", c.id).order("round_number", { ascending: true, nullsFirst: false }).order("kickoff", { ascending: true }),
    ]);
    const orderedSeasons = [...(se.data || [])].sort((a, b) => (b.label || "").localeCompare(a.label || ""));
    setSeasons(orderedSeasons); setSeasonLabel(orderedSeasons[0]?.label || ""); setMatches(ma.data || []);
    const ids = [...new Set((ma.data || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
    if (ids.length) {
      const { data: cl } = await supabase.from("clubs").select("*").in("id", ids);
      setClubsMap(Object.fromEntries((cl || []).map((x) => [x.id, x])));
      const { data: pl } = await supabase.from("players").select("*").in("club_id", ids).order("name");
      setPlayers(pl || []);
      const pids = (pl || []).map((p) => p.id);
      if (pids.length) {
        const { data: s, error: statsError } = await supabase.from("player_season_stats").select("*").eq("competition_id", c.id).in("player_id", pids);
        if (statsError) throw statsError;
        setPlayerStats(s || []);
      } else setPlayerStats([]);
    }
  })().catch(() => setComp(null)); }, [slug]);

  const pss = useMemo(() => {
    const activeSeason = seasonKey(seasonLabel);
    const rows = activeSeason ? playerStats.filter((stat) => seasonKey(stat.season) === activeSeason) : playerStats;
    return Object.fromEntries(rows.map((stat) => [stat.player_id, stat]));
  }, [playerStats, seasonLabel]);
  const activeSeason = seasons.find((season) => season.label === seasonLabel) || null;
  const seasonMatches = useMemo(() => {
    if (!activeSeason || !matches.some((match) => match.season_id)) return matches;
    return matches.filter((match) => match.season_id === activeSeason.id);
  }, [matches, activeSeason]);
  const phases = useMemo(() => competitionPhases(seasonMatches, competitionType), [seasonMatches, competitionType]);
  const primaryPhase = (isCup ? phases[phases.length - 1] : phases[0]) || null;
  const curPhase = phase && phases.includes(phase) ? phase : primaryPhase;
  const phaseMatches = useMemo(() => seasonMatches.filter((m) => (m.phase || "—") === curPhase), [seasonMatches, curPhase]);
  const zones = zonesForPhase(comp, activeSeason, curPhase, primaryPhase);
  const phaseFinished = phaseMatches.filter((m) => m.status === "finished" && m.home_score != null);
  const standings = useMemo(() => isCup ? [] : computeStandings(phaseFinished), [phaseFinished, isCup]);
  const rounds = useMemo(() => { const seen = new Map(); for (const m of phaseMatches) { const k = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); if (!seen.has(k)) seen.set(k, { key: k, num: m.round_number, label: m.round_number != null ? `${L("comp.round", "Journée")} ${m.round_number}` : (m.round_raw || "Tour") }); } return [...seen.values()].sort((a, b) => (a.num ?? 999) - (b.num ?? 999)); }, [phaseMatches]);
  const shownMatches = round === "all" ? phaseMatches : phaseMatches.filter((m) => (m.round_number != null ? String(m.round_number) : (m.round_raw || "?")) === round);
  const grouped = useMemo(() => { const g = {}; for (const m of shownMatches) { const k = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); (g[k] ||= { label: m.round_number != null ? `${L("comp.round", "Journée")} ${m.round_number}` : (m.round_raw || "Tour"), num: m.round_number, items: [] }).items.push(m); } return Object.values(g).sort((a, b) => (a.num ?? 999) - (b.num ?? 999)); }, [shownMatches]);

  const clubName = (id) => clubsMap[id]?.name || "—";
  const withStats = players.map((p) => ({ p, st: pss[p.id] })).filter((x) => x.st);
  const topBy = (key) => withStats.filter((x) => x.st[key] != null).sort((a, b) => (b.st[key] || 0) - (a.st[key] || 0)).slice(0, 10);
  const maxApp = Math.max(0, ...withStats.map((x) => x.st.appearances || 0));
  const ratingThreshold = comp?.rating_min ?? Math.max(5, Math.round(maxApp * 0.4));
  const topRating = withStats.filter((x) => x.st.rating != null && (x.st.appearances || 0) >= ratingThreshold).sort((a, b) => b.st.rating - a.st.rating).slice(0, 10);

  if (comp === undefined) return <p className="text-muted">Chargement…</p>;
  if (comp === null) return <p className="text-muted">Compétition introuvable.</p>;
  const seasonClubIds = new Set(seasonMatches.flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean));
  const clubsList = Object.values(clubsMap).filter((club) => seasonClubIds.has(club.id));
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

  // Clean sheets attribués au gardien n°1 de chaque club (heuristique : GK avec le plus de minutes)
  const csMap = {};
  for (const m of phaseFinished) { if (m.away_score === 0 && m.home_club_id) csMap[m.home_club_id] = (csMap[m.home_club_id] || 0) + 1; if (m.home_score === 0 && m.away_club_id) csMap[m.away_club_id] = (csMap[m.away_club_id] || 0) + 1; }
  const gkCleanSheets = Object.entries(csMap).map(([club, v]) => {
    const gks = players.filter((p) => p.club_id === club && p.position === "Goalkeeper");
    if (!gks.length) return null;
    const gk = gks.map((p) => ({ p, min: pss[p.id]?.minutes || 0 })).sort((a, b) => b.min - a.min)[0].p;
    return { p: gk, st: { cs: v }, v };
  }).filter(Boolean).sort((a, b) => b.v - a.v).slice(0, 10);
  const topCS = gkCleanSheets[0];

  const lastRound = Math.max(-1, ...phaseFinished.map((m) => m.round_number ?? -1));
  const lastResults = lastRound >= 0 ? phaseMatches.filter((m) => (m.round_number ?? -1) === lastRound) : [...phaseFinished].sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 10);
  const nextRound = Math.min(Infinity, ...phaseMatches.filter((m) => m.status !== "finished" && m.round_number != null).map((m) => m.round_number));
  const upcoming = Number.isFinite(nextRound) ? phaseMatches.filter((m) => m.round_number === nextRound) : [...seasonMatches].filter((m) => m.status !== "finished").sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0)).slice(0, 10);
  const allFinished = seasonMatches.length > 0 && seasonMatches.every((m) => m.status === "finished");

  const ClubChip = ({ id }) => <Link href={`/clubs/${id}`} className="inline-flex min-w-0 items-center gap-2 hover:text-accent">{clubsMap[id]?.logo_url && <img src={clubsMap[id].logo_url} className="h-5 w-5 shrink-0 object-contain" alt="" />}<span className="truncate">{clubName(id)}</span></Link>;

  const Card = ({ title, onSee, children, bgKey }) => {
    const t = bgKey ? tiles(bgKey) : null;
    const style = { ...(t?.background_url ? { backgroundImage: `url(${t.background_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}), ...(t?.border_color ? { borderColor: t.border_color } : {}) };
    return (
      <div className={`relative flex h-full flex-col overflow-hidden rounded-2xl border border-line/10 p-4 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.8)] ${t?.background_url ? "" : "bg-gradient-to-b from-surface to-bg/40"}`} style={style}>
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
              <span className="min-w-0"><b className="block truncate">{x.p.name}</b><span className="flex items-center gap-1 text-xs text-muted">{clubsMap[x.p.club_id]?.logo_url && <img src={clubsMap[x.p.club_id].logo_url} className="h-3.5 w-3.5 object-contain" alt="" />}{clubName(x.p.club_id)}</span>{meta && <span className="block text-[11px] text-muted/70">{meta(x.st)}</span>}</span>
              <b className="ml-auto text-2xl" style={{ color: accent }}>{unit}</b>
            </div>
          ) : <p className="mt-2 text-sm text-muted">—</p>}
        </div>
      </button>
    );
  };

  const FormDots = ({ res }) => <span className="hidden gap-0.5 sm:flex">{res.map((r, i) => <span key={i} className={`h-2 w-2 rounded-full ${r === "V" ? "bg-green-400" : r === "N" ? "bg-white/25" : "bg-red-400"}`} title={r} />)}</span>;
  const PhaseChips = () => phases.length > 1 ? <div className="mb-4 flex flex-wrap gap-1">{phases.map((ph) => <button key={ph} onClick={() => { setPhase(ph); setRound("all"); }} className={`rounded-full border px-3 py-1 text-xs ${curPhase === ph ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{ph}</button>)}</div> : null;

  function TopCategory({ title, id, rows, fmt, meta, accent = "#ef4444" }) {
    if (!rows.length) return <div id={id} className="h-full rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/35 p-4"><h3 className="mb-2 font-bold" style={{ color: accent }}>{title}</h3><p className="text-sm text-muted">—</p></div>;
    const [a, b, c, ...rest] = rows;
    const Sub = ({ cid }) => <span className="flex items-center gap-1 text-[11px] text-muted">{clubsMap[cid]?.logo_url && <img src={clubsMap[cid].logo_url} className="h-3.5 w-3.5 object-contain" alt="" />}{clubName(cid)}</span>;
    const Med = ({ x, tone, ring }) => <Link href={`/players/${x.p.id}`} className={`flex items-center gap-2 rounded-xl border p-2 ${tone}`}><img src={x.p.photo_url || ""} className={`h-9 w-9 rounded-full object-cover ring-1 ${ring}`} alt="" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{x.p.name}</span><Sub cid={x.p.club_id} /></span><b>{fmt(x.st)}</b></Link>;
    return (
      <div id={id} className="h-full rounded-2xl border bg-gradient-to-b from-surface to-bg/35 p-4 shadow-[0_18px_45px_-34px_rgba(0,0,0,0.95)]" style={{ borderColor: `${accent}45` }}>
        <div className="mb-3 flex items-center gap-2"><span className="h-4 w-1 rounded-full" style={{ background: accent }} /><h3 className="font-black">{title}</h3></div>
        <Link href={`/players/${a.p.id}`} className="mb-2 flex items-center gap-3 rounded-2xl border p-3 transition hover:brightness-110" style={{ borderColor: `${accent}60`, background: `${accent}12` }}>
          <img src={a.p.photo_url || ""} className="h-14 w-14 rounded-full object-cover ring-2" style={{ "--tw-ring-color": `${accent}90` }} alt="" />
          <span className="min-w-0 flex-1"><span className="block truncate font-black">{a.p.name}</span><Sub cid={a.p.club_id} />{meta && <span className="block text-[11px] text-muted/70">{meta(a.st)}</span>}</span>
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
      <CompetitionHeader comp={comp} seasonLabel={seasonLabel} kicker={L("comp.kicker", "Compétitions")} />
      {competitions.length > 1 && (
        <div className="-mt-2 mb-5 flex justify-center">
          <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line/10 bg-surface2/80 p-1 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.9)] backdrop-blur">
            {competitions.map((item) => {
              const active = item.id === comp.id;
              return <Link key={item.id} href={`${competitionPath(item)}?tab=${tab}`} aria-current={active ? "page" : undefined} className={`group flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition sm:px-4 ${active ? "bg-accent text-white shadow-[0_5px_18px_-8px_rgba(239,68,68,0.9)]" : "text-muted hover:bg-white/[0.05] hover:text-content"}`}>{item.logo_url && <img src={item.logo_url} className="h-5 w-5 object-contain" alt="" />}<span>{item.header_title?.trim() || item.name}</span></Link>;
            })}
          </div>
        </div>
      )}
      <div className="mb-6 flex items-center justify-between gap-2 border-b border-line/10">
        <div className="flex flex-wrap gap-1">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm ${tab === k ? "border-b-2 border-accent font-bold text-content" : "text-muted hover:text-content"}`}>{l}</button>)}</div>
        {seasons.length > 0 && <select value={seasonLabel} onChange={(e) => { setSeasonLabel(e.target.value); setPhase(null); setRound("all"); }} className="shrink-0 rounded border border-line/10 bg-surface px-2 py-1 text-xs">{seasons.map((s) => <option key={s.id}>{s.label}</option>)}</select>}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            {isCup ? (
              <Card title={L("cup.currentRound", "Tour sélectionné")} onSee={() => setTab("classement")}>
                <div className="flex h-full flex-col justify-center rounded-xl border border-accent/15 bg-accent/5 p-4">
                  <div className="text-2xl font-black">{curPhase || "—"}</div>
                  <div className="mt-2 flex gap-4 text-xs text-muted"><span><b className="text-content">{phaseMatches.length}</b> matchs</span><span><b className="text-content">{phaseFinished.length}</b> terminés</span></div>
                  <p className="mt-3 text-xs text-muted">{L("cup.noPointsShort", "Format à élimination directe, sans classement à points.")}</p>
                </div>
              </Card>
            ) : (
              <Card title={L("comp.top5", "Classement — Top 5")} onSee={() => setTab("classement")}>
                <div className="flex h-full flex-col">
                  <div className="flex flex-1 flex-col justify-between gap-1">
                  {standings.slice(0, 5).map((r, i) => { const z = zoneFor(i + 1); return (
                    <div key={r.club} className="group flex items-center gap-2 rounded-xl border border-white/[0.035] bg-gradient-to-r from-white/[0.045] to-transparent px-2 py-1.5 transition hover:border-accent/20 hover:bg-white/[0.06]">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-black" style={z ? { borderColor: `${z.color}80`, background: `${z.color}22`, color: z.color } : { borderColor: "rgba(148,163,184,0.5)", background: "rgba(148,163,184,0.2)", color: "rgb(226,232,240)" }}>{i + 1}</span>
                      {clubsMap[r.club]?.logo_url && <img src={clubsMap[r.club].logo_url} className="h-6 w-6 shrink-0 object-contain" alt="" />}
                      <Link href={`/clubs/${r.club}`} className="min-w-0 flex-1 truncate font-semibold hover:text-accent">{clubName(r.club)}</Link>
                      <FormDots res={clubForm(phaseFinished, r.club)} />
                      <b className="min-w-9 rounded-lg bg-white/[0.06] px-1.5 py-1 text-center tabular-nums">{r.pts}</b>
                    </div>); })}
                  {standings.length === 0 && <p className="text-muted">—</p>}
                  </div>
                  {zones.length > 0 && <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 border-t border-line/10 pt-2 text-[10px] text-muted">{zones.map((z, i) => <span key={i} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: z.color }} />{z.label}</span>)}</div>}
                </div>
              </Card>
            )}
            <Card title={isCup ? `${L("comp.results", "Résultats")} — ${curPhase || L("cup.round", "Tour")}` : (lastRound >= 0 ? `${L("comp.results", "Résultats")} — ${L("comp.round", "Journée")} ${lastRound}` : L("comp.results", "Derniers résultats"))} onSee={() => setTab("matchs")}>
              <div className="space-y-1.5">{lastResults.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} compact />)}{lastResults.length === 0 && <p className="text-sm text-muted">—</p>}</div>
            </Card>
            <Card title={!isCup && Number.isFinite(nextRound) ? `${L("comp.upcoming", "Prochaine journée")} — J${nextRound}` : L("comp.upcoming", "Prochains matchs")} onSee={() => setTab("matchs")} bgKey="upcoming">
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
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted"><span className="h-3 w-1 rounded bg-accent" />{L("comp.otherstats", "Autres statistiques")}</div>
            {isCup ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("cup.roundMatches", "Matchs du tour")}</div><b className="mt-2 block text-2xl">{phaseMatches.length}</b></div>
                <div className="rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("cup.roundGoals", "Buts du tour")}</div><b className="mt-2 block text-2xl">{goals}</b></div>
                <button onClick={() => setTab("classement")} className="rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4 text-left transition hover:border-accent/40"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("cup.allRounds", "Tous les tours")}</div><b className="mt-2 block text-2xl">{phases.length}</b></button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <Link href={inForm ? `/clubs/${inForm.club}` : "#"} className="block rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4 transition hover:border-accent/40"><div className="text-xs font-bold uppercase tracking-wider text-muted">🔥 {L("comp.inform", "Club en forme")}</div>{inForm ? <div className="mt-2"><ClubChip id={inForm.club} /><div className="mt-1 flex gap-1 text-xs">{inForm.res.map((r, i) => <span key={i} className={`rounded px-1 ${r === "V" ? "bg-green-500/20 text-green-400" : r === "N" ? "bg-white/10 text-muted" : "bg-red-500/20 text-red-400"}`}>{r}</span>)}</div></div> : <p className="mt-2 text-sm text-muted">—</p>}</Link>
                <button onClick={() => setTab("classement")} className="rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4 text-left transition hover:border-accent/40"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("stat.bestatk", "Meilleure attaque")}</div>{bestAtk ? <div className="mt-2 flex items-center justify-between"><ClubChip id={bestAtk.club} /><b className="text-xl">{bestAtk.gf}</b></div> : <p className="mt-2 text-sm text-muted">—</p>}</button>
                <button onClick={() => setTab("classement")} className="rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40 p-4 text-left transition hover:border-accent/40"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("stat.bestdef", "Meilleure défense")}</div>{bestDef ? <div className="mt-2 flex items-center justify-between"><ClubChip id={bestDef.club} /><b className="text-xl">{bestDef.ga}</b></div> : <p className="mt-2 text-sm text-muted">—</p>}</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-line/10 pt-4 text-center text-xs text-muted sm:grid-cols-4">
            <div><b className="block text-base text-content">{clubsList.length}</b>{L("nav.clubs", "clubs")}</div>
            <div><b className="block text-base text-content">{seasonMatches.length}</b>{L("nav.matchs", "matchs")}</div>
            <div><b className="block text-base text-content">{players.length}</b>{L("nav.joueurs", "joueurs")}</div>
            <div><b className="block text-base text-content">{seasons.length}</b>saisons</div>
          </div>
        </div>
      )}

      {tab === "matchs" && (
        <div>
          <PhaseChips />
          {rounds.length > 1 && <div className="mb-4 flex flex-wrap gap-1"><button onClick={() => setRound("all")} className={`rounded-full border px-3 py-1 text-xs ${round === "all" ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{L("filter.all", "Tout")}</button>{rounds.map((r) => <button key={r.key} onClick={() => setRound(r.key)} className={`rounded-full border px-3 py-1 text-xs ${round === r.key ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{r.num != null ? `J${r.num}` : r.label}</button>)}</div>}
          {grouped.map((g) => { const ds = g.items.map((m) => m.kickoff).filter(Boolean).sort(); const range = ds.length ? new Date(ds[0]).toLocaleDateString("fr-BE", { day: "numeric", month: "short" }) + (ds[0].slice(0, 10) !== ds[ds.length - 1].slice(0, 10) ? " – " + new Date(ds[ds.length - 1]).toLocaleDateString("fr-BE", { day: "numeric", month: "short" }) : "") : ""; return (<div key={g.label} className="mb-5"><div className="mb-2 flex items-baseline gap-2"><span className="text-xs font-bold uppercase tracking-wider text-muted">{g.label}</span>{range && <span className="text-[11px] text-muted/60">{range}</span>}</div><div className="space-y-2">{g.items.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}</div></div>); })}
          {shownMatches.length === 0 && <p className="text-muted">{L("empty.matches", "Aucun match.")}</p>}
        </div>
      )}

      {tab === "classement" && (isCup
        ? <CupRounds matches={seasonMatches} clubs={clubsMap} phases={phases} activePhase={curPhase} onPhaseChange={(next) => { setPhase(next); setRound("all"); }} L={L} />
        : <div><PhaseChips /><StandingsTable standings={standings} clubs={clubsMap} zones={zones} L={L} /></div>)}

      {tab === "clubs" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clubsList.map((c) => <Link key={c.id} href={`/clubs/${c.id}`} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-3 transition hover:border-accent/40">{c.logo_url && <img src={c.logo_url} className="h-8 w-8 object-contain" alt="" />}<span className="font-semibold">{c.name}</span></Link>)}
          {clubsList.length === 0 && <p className="text-muted">{L("empty.clubs", "Aucun club.")}</p>}
        </div>
      )}

      {tab === "joueurs" && (
        selClub === null ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[...clubsList].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
              <button key={c.id} onClick={() => { setSelClub(c.id); setPosFilter("all"); }} className="rounded-2xl border border-line/10 bg-surface p-4 text-center transition hover:border-accent/40">{c.logo_url && <img src={c.logo_url} className="mx-auto h-14 w-14 object-contain" alt="" />}<div className="mt-2 font-bold">{c.name}</div><div className="text-xs text-muted">{players.filter((p) => p.club_id === c.id).length} {L("nav.joueurs", "joueurs")}</div></button>
            ))}
            {clubsList.length === 0 && <p className="text-muted">{L("empty.players", "Aucun joueur.")}</p>}
          </div>
        ) : (() => {
          const POS_LABEL = { all: L("pos.all", "Tous"), Goalkeeper: L("pos.gk", "Gardiens"), Defender: L("pos.def", "Défenseurs"), Midfielder: L("pos.mid", "Milieux"), Attacker: L("pos.fwd", "Attaquants") };
          const roster = players.filter((p) => (selClub === "__none__" ? !p.club_id : p.club_id === selClub));
          const shown = roster.filter((p) => posFilter === "all" || p.position === posFilter).sort((a, b) => (POS[a.position] ?? 9) - (POS[b.position] ?? 9) || (a.name || "").localeCompare(b.name || ""));
          return (
            <div>
              <div className="mb-3 flex items-center gap-3"><button onClick={() => setSelClub(null)} className="text-sm text-muted hover:text-content">← {L("nav.clubs", "Clubs")}</button><span className="flex items-center gap-2 font-bold">{clubsMap[selClub]?.logo_url && <img src={clubsMap[selClub].logo_url} className="h-6 w-6 object-contain" alt="" />}{clubName(selClub)}</span></div>
              <div className="mb-4 flex flex-wrap gap-1">{["all", "Goalkeeper", "Defender", "Midfielder", "Attacker"].map((pf) => <button key={pf} onClick={() => setPosFilter(pf)} className={`rounded-full border px-3 py-1 text-xs ${posFilter === pf ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{POS_LABEL[pf]}</button>)}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((p) => <Link key={p.id} href={`/players/${p.id}`} className="rounded-2xl border border-line/10 bg-surface p-3 text-center transition hover:border-accent/40"><img src={p.photo_url || ""} className="mx-auto h-16 w-16 rounded-full object-cover" alt="" /><div className="mt-2 truncate text-sm font-bold">{p.name}</div><div className="text-xs text-muted">{[p.position, p.age ? `${p.age} ans` : null].filter(Boolean).join(" · ")}</div>{p.nationality && <div className="mt-1 text-[10px] uppercase tracking-wider text-muted/60">{p.nationality}</div>}</Link>)}
                {shown.length === 0 && <p className="text-muted">{L("empty.players", "Aucun joueur.")}</p>}
              </div>
            </div>
          );
        })()
      )}

      {tab === "stats" && (
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
