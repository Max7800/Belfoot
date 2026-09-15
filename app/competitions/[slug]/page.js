"use client";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";
import StandingsTable from "@/components/football/StandingsTable";
import CompetitionHeader from "@/components/football/CompetitionHeader";
import { computeStandings } from "@/lib/standings";
import { useLabels } from "@/lib/labels";

const POS = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };
function clubForm(ms, clubId) {
  const rel = ms.filter((m) => m.home_score != null && (m.home_club_id === clubId || m.away_club_id === clubId)).sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 5);
  let pts = 0; const res = [];
  for (const m of rel) { const home = m.home_club_id === clubId; const gf = home ? m.home_score : m.away_score, ga = home ? m.away_score : m.home_score; if (gf > ga) { pts += 3; res.push("V"); } else if (gf === ga) { pts += 1; res.push("N"); } else res.push("D"); }
  return { pts, res };
}

export default function CompetitionPage() {
  const { slug } = useParams();
  const L = useLabels();
  const [comp, setComp] = useState(undefined);
  const [tab, setTab] = useState("overview");
  const [seasons, setSeasons] = useState([]); const [seasonLabel, setSeasonLabel] = useState("");
  const [matches, setMatches] = useState([]);
  const [clubsMap, setClubsMap] = useState({});
  const [players, setPlayers] = useState([]); const [pss, setPss] = useState({});
  const [phase, setPhase] = useState(null); const [round, setRound] = useState("all");
  const [selClub, setSelClub] = useState(null); const [posFilter, setPosFilter] = useState("all");
  const [anchor, setAnchor] = useState(null);

  useEffect(() => { if (tab === "stats" && anchor) { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); setAnchor(null); } }, [tab, anchor]);
  const goStats = (sec) => { setTab("stats"); setAnchor(sec); };

  const TABS = [["overview", L("comp.tab.overview", "Vue d'ensemble")], ["matchs", L("nav.matchs", "Matchs")], ["classement", L("nav.classement", "Classement")], ["clubs", L("nav.clubs", "Clubs")], ["joueurs", L("nav.joueurs", "Joueurs")], ["stats", L("comp.tab.stats", "Stats")]];

  useEffect(() => { (async () => {
    let c = (await supabase.from("competitions").select("*").eq("slug", slug).maybeSingle()).data;
    if (!c) c = (await supabase.from("competitions").select("*").eq("id", slug).maybeSingle()).data;
    if (!c) { setComp(null); return; }
    setComp(c);
    const [se, ma] = await Promise.all([
      supabase.from("seasons").select("*").eq("competition_id", c.id),
      supabase.from("matches").select("*").eq("competition_id", c.id).order("round_number", { ascending: true, nullsFirst: false }).order("kickoff", { ascending: true }),
    ]);
    setSeasons(se.data || []); setSeasonLabel((se.data || [])[0]?.label || ""); setMatches(ma.data || []);
    const ids = [...new Set((ma.data || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
    if (ids.length) {
      const { data: cl } = await supabase.from("clubs").select("*").in("id", ids);
      setClubsMap(Object.fromEntries((cl || []).map((x) => [x.id, x])));
      const { data: pl } = await supabase.from("players").select("*").in("club_id", ids).order("name");
      setPlayers(pl || []);
      const pids = (pl || []).map((p) => p.id);
      if (pids.length) { const { data: s } = await supabase.from("player_season_stats").select("*").in("player_id", pids); setPss(Object.fromEntries((s || []).map((x) => [x.player_id, x]))); }
    }
  })().catch(() => setComp(null)); }, [slug]);

  const phases = useMemo(() => { const n = {}; for (const m of matches) { const p = m.phase || "—"; n[p] = (n[p] || 0) + 1; } return Object.keys(n).sort((a, b) => n[b] - n[a]); }, [matches]);
  const curPhase = phase || phases[0] || null;
  const phaseMatches = useMemo(() => matches.filter((m) => (m.phase || "—") === curPhase), [matches, curPhase]);
  const phaseFinished = phaseMatches.filter((m) => m.status === "finished" && m.home_score != null);
  const standings = useMemo(() => computeStandings(phaseFinished), [phaseFinished]);
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
  const clubsList = Object.values(clubsMap);
  const zones = comp.zones || [];
  const zoneFor = (pos) => zones.find((z) => pos >= (z.from || 0) && pos <= (z.to || 0));

  const goals = phaseFinished.reduce((s, m) => s + m.home_score + m.away_score, 0);
  let homeW = 0, draw = 0, awayW = 0;
  phaseFinished.forEach((m) => { if (m.home_score > m.away_score) homeW++; else if (m.home_score === m.away_score) draw++; else awayW++; });
  const maxPlayed = Math.max(0, ...standings.map((r) => r.played));
  const eligible = standings.filter((r) => r.played >= Math.max(3, maxPlayed * 0.5));
  const bestAtk = [...eligible].sort((a, b) => b.gf - a.gf)[0];
  const bestDef = [...eligible].sort((a, b) => a.ga - b.ga)[0];
  const inForm = standings.map((r) => ({ club: r.club, ...clubForm(phaseFinished, r.club) })).sort((a, b) => b.pts - a.pts)[0];
  const topScorer = topBy("goals")[0]; const topAssist = topBy("assists")[0]; const topRate = topRating[0];
  const lastRound = Math.max(-1, ...phaseFinished.map((m) => m.round_number ?? -1));
  const lastResults = lastRound >= 0 ? phaseMatches.filter((m) => (m.round_number ?? -1) === lastRound) : [...phaseFinished].sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 10);
  const nextRound = Math.min(Infinity, ...phaseMatches.filter((m) => m.status !== "finished" && m.round_number != null).map((m) => m.round_number));
  const upcoming = Number.isFinite(nextRound) ? phaseMatches.filter((m) => m.round_number === nextRound) : [...matches].filter((m) => m.status !== "finished").sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0)).slice(0, 10);
  const allFinished = matches.length > 0 && matches.every((m) => m.status === "finished");
  const csMap = {};
  for (const m of phaseFinished) { if (m.away_score === 0 && m.home_club_id) csMap[m.home_club_id] = (csMap[m.home_club_id] || 0) + 1; if (m.home_score === 0 && m.away_club_id) csMap[m.away_club_id] = (csMap[m.away_club_id] || 0) + 1; }
  const cleanSheets = Object.entries(csMap).map(([club, v]) => ({ club, v })).sort((a, b) => b.v - a.v).slice(0, 10);

  const ClubChip = ({ id }) => <Link href={`/clubs/${id}`} className="inline-flex min-w-0 items-center gap-2 hover:text-accent">{clubsMap[id]?.logo_url && <img src={clubsMap[id].logo_url} className="h-5 w-5 shrink-0 object-contain" alt="" />}<span className="truncate">{clubName(id)}</span></Link>;
  const Card = ({ title, onSee, children }) => <div className="flex h-full flex-col rounded-2xl border border-line/10 bg-surface p-4"><div className="mb-2 flex shrink-0 items-center justify-between"><div className="text-xs font-bold uppercase tracking-wider text-muted">{title}</div>{onSee && <button onClick={onSee} className="text-xs text-accent hover:underline">{L("comp.seeall", "Voir tout")} →</button>}</div><div className="flex-1">{children}</div></div>;
  const LeaderCard = ({ icon, title, x, unit, meta, onClick }) => <button onClick={onClick} className="w-full rounded-2xl border border-accent/30 bg-accent/5 p-4 text-left transition hover:border-accent/60"><div className="text-xs font-bold uppercase tracking-wider text-muted">{icon} {title}</div>{x ? <div className="mt-2 flex items-center gap-3"><img src={x.p.photo_url || ""} className="h-14 w-14 rounded-full object-cover" alt="" /><span className="min-w-0"><b className="block truncate">{x.p.name}</b><span className="flex items-center gap-1 text-xs text-muted">{clubsMap[x.p.club_id]?.logo_url && <img src={clubsMap[x.p.club_id].logo_url} className="h-3.5 w-3.5 object-contain" alt="" />}{clubName(x.p.club_id)}</span>{meta && <span className="block text-[11px] text-muted/70">{meta(x.st)}</span>}</span><b className="ml-auto text-2xl">{unit}</b></div> : <p className="mt-2 text-sm text-muted">—</p>}</button>;
  const PhaseChips = () => phases.length > 1 ? <div className="mb-4 flex flex-wrap gap-1">{phases.map((ph) => <button key={ph} onClick={() => { setPhase(ph); setRound("all"); }} className={`rounded-full border px-3 py-1 text-xs ${curPhase === ph ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{ph}</button>)}</div> : null;

  function TopCategory({ title, id, rows, fmt, meta }) {
    if (!rows.length) return <div id={id}><h3 className="mb-2 font-bold">{title}</h3><p className="text-sm text-muted">—</p></div>;
    const [a, b, c, ...rest] = rows;
    const Sub = ({ id }) => <span className="flex items-center gap-1 text-[11px] text-muted">{clubsMap[id]?.logo_url && <img src={clubsMap[id].logo_url} className="h-3.5 w-3.5 object-contain" alt="" />}{clubName(id)}</span>;
    const Medal = ({ x, tone, ring }) => <Link href={`/players/${x.p.id}`} className={`flex items-center gap-2 rounded-xl border p-2 ${tone}`}><img src={x.p.photo_url || ""} className={`h-9 w-9 rounded-full object-cover ring-1 ${ring}`} alt="" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{x.p.name}</span><Sub id={x.p.club_id} /></span><b>{fmt(x.st)}</b></Link>;
    return (
      <div id={id}>
        <h3 className="mb-2 font-bold">{title}</h3>
        <Link href={`/players/${a.p.id}`} className="mb-2 flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3">
          <img src={a.p.photo_url || ""} className="h-14 w-14 rounded-full object-cover ring-2 ring-amber-400/60" alt="" />
          <span className="min-w-0 flex-1"><span className="block truncate font-black">{a.p.name}</span><Sub id={a.p.club_id} />{meta && <span className="block text-[11px] text-muted/70">{meta(a.st)}</span>}</span>
          <b className="text-2xl text-amber-300">{fmt(a.st)}</b>
        </Link>
        {(b || c) && <div className="mb-2 grid grid-cols-2 gap-2">{b && <Medal x={b} tone="border-slate-300/25 bg-slate-300/5" ring="ring-slate-300/40" />}{c && <Medal x={c} tone="border-amber-700/30 bg-amber-700/5" ring="ring-amber-700/40" />}</div>}
        {rest.length > 0 && <ol className="space-y-1 text-sm">{rest.map((x, i) => <li key={x.p.id} className="flex items-center gap-2"><span className="w-4 text-muted">{i + 4}</span><Link href={`/players/${x.p.id}`} className="min-w-0 flex-1 truncate hover:text-accent">{x.p.name}</Link><b>{fmt(x.st)}</b></li>)}</ol>}
      </div>
    );
  }

  function ClubTop({ title, id, rows, unit }) {
    if (!rows.length) return <div id={id}><h3 className="mb-2 font-bold">{title}</h3><p className="text-sm text-muted">—</p></div>;
    const [a, b, c, ...rest] = rows;
    const Med = ({ x, tone }) => <Link href={`/clubs/${x.club}`} className={`flex items-center gap-2 rounded-xl border p-2 ${tone}`}>{clubsMap[x.club]?.logo_url && <img src={clubsMap[x.club].logo_url} className="h-8 w-8 object-contain" alt="" />}<span className="min-w-0 flex-1 truncate text-sm font-bold">{clubName(x.club)}</span><b>{x.v}</b></Link>;
    return (<div id={id}><h3 className="mb-2 font-bold">{title}</h3>
      <Link href={`/clubs/${a.club}`} className="mb-2 flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3">{clubsMap[a.club]?.logo_url && <img src={clubsMap[a.club].logo_url} className="h-12 w-12 object-contain" alt="" />}<span className="min-w-0 flex-1 truncate font-black">{clubName(a.club)}</span><b className="text-2xl text-amber-300">{a.v}</b></Link>
      {(b || c) && <div className="mb-2 grid grid-cols-2 gap-2">{b && <Med x={b} tone="border-slate-300/25 bg-slate-300/5" />}{c && <Med x={c} tone="border-amber-700/30 bg-amber-700/5" />}</div>}
      {rest.length > 0 && <ol className="space-y-1 text-sm">{rest.map((x, i) => <li key={x.club} className="flex items-center gap-2"><span className="w-4 text-muted">{i + 4}</span><Link href={`/clubs/${x.club}`} className="min-w-0 flex-1 truncate hover:text-accent">{clubName(x.club)}</Link><b>{x.v}</b></li>)}</ol>}
    </div>);
  }

  return (
    <div>
      <CompetitionHeader comp={comp} seasonLabel={seasonLabel} kicker={L("comp.kicker", "Compétitions")} />
      <div className="mb-6 flex items-center justify-between gap-2 border-b border-line/10">
        <div className="flex flex-wrap gap-1">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm ${tab === k ? "border-b-2 border-accent font-bold text-content" : "text-muted hover:text-content"}`}>{l}</button>)}</div>
        {seasons.length > 0 && <select value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} className="shrink-0 rounded border border-line/10 bg-surface px-2 py-1 text-xs">{seasons.map((s) => <option key={s.id}>{s.label}</option>)}</select>}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={L("comp.top5", "Classement")} onSee={() => setTab("classement")}>
              <ol className="space-y-0.5 text-[15px]">
                {standings.slice(0, 5).map((r, i) => { const z = zoneFor(i + 1); return (
                  <li key={r.club} className="flex items-center gap-2 rounded-lg py-1.5" style={z ? { boxShadow: `inset 3px 0 0 ${z.color}`, paddingLeft: 6 } : null}>
                    <span className="w-5 shrink-0 text-center font-bold" style={z ? { color: z.color } : null}>{i + 1}</span>
                    {clubsMap[r.club]?.logo_url && <img src={clubsMap[r.club].logo_url} className="h-6 w-6 shrink-0 object-contain" alt="" />}
                    <Link href={`/clubs/${r.club}`} className="min-w-0 flex-1 truncate font-semibold hover:text-accent">{clubName(r.club)}</Link><b className="ml-auto">{r.pts}</b>
                  </li>); })}
                {standings.length === 0 && <li className="text-muted">—</li>}
              </ol>
              {zones.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted">{zones.map((z, i) => <span key={i} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: z.color }} />{z.label}</span>)}</div>}
            </Card>
            <Card title={lastRound >= 0 ? `${L("comp.results", "Résultats")} — ${L("comp.round", "Journée")} ${lastRound}` : L("comp.results", "Derniers résultats")} onSee={() => setTab("matchs")}>
              <div className="space-y-1">{lastResults.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} compact />)}{lastResults.length === 0 && <p className="text-sm text-muted">—</p>}</div>
            </Card>
            <Card title={Number.isFinite(nextRound) ? `${L("comp.upcoming", "Prochaine journée")} — J${nextRound}` : L("comp.upcoming", "Prochains matchs")} onSee={() => setTab("matchs")}>
              {upcoming.length ? <div className="space-y-1">{upcoming.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} compact />)}</div>
                : <div className="flex flex-col items-center gap-2 py-8 text-muted"><Calendar className="h-6 w-6" /><span className="text-sm">{allFinished ? L("empty.season", "Saison terminée") : L("empty.upcoming", "Aucun match à venir")}</span></div>}
            </Card>
          </div>

          <div>
            <div className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">{L("comp.leaders", "Les leaders")}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <LeaderCard icon="⚽" title={L("comp.topscorer", "Meilleur buteur")} x={topScorer} unit={topScorer?.st.goals} onClick={() => goStats("buteurs")} />
              <LeaderCard icon="🅰️" title={L("comp.topassist", "Meilleur passeur")} x={topAssist} unit={topAssist?.st.assists} onClick={() => goStats("passeurs")} />
              <LeaderCard icon="⭐" title={L("comp.toprating", "Meilleure note")} x={topRate} unit={topRate?.st.rating?.toFixed?.(2)} meta={(s) => `${s.appearances || 0} app · ${s.minutes || 0} min`} onClick={() => goStats("notes")} />
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">{L("comp.otherstats", "Autres statistiques")}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Link href={inForm ? `/clubs/${inForm.club}` : "#"} className="block rounded-2xl border border-line/10 bg-surface p-4 transition hover:border-accent/40"><div className="text-xs font-bold uppercase tracking-wider text-muted">🔥 {L("comp.inform", "Club en forme")}</div>{inForm ? <div className="mt-2"><ClubChip id={inForm.club} /><div className="mt-1 flex gap-1 text-xs">{inForm.res.map((r, i) => <span key={i} className={`rounded px-1 ${r === "V" ? "bg-green-500/20 text-green-400" : r === "N" ? "bg-white/10 text-muted" : "bg-red-500/20 text-red-400"}`}>{r}</span>)}</div></div> : <p className="mt-2 text-sm text-muted">—</p>}</Link>
              <button onClick={() => setTab("classement")} className="rounded-2xl border border-line/10 bg-surface p-4 text-left transition hover:border-accent/40"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("stat.bestatk", "Meilleure attaque")}</div>{bestAtk ? <div className="mt-2 flex items-center justify-between"><ClubChip id={bestAtk.club} /><b className="text-xl">{bestAtk.gf}</b></div> : <p className="mt-2 text-sm text-muted">—</p>}</button>
              <button onClick={() => setTab("classement")} className="rounded-2xl border border-line/10 bg-surface p-4 text-left transition hover:border-accent/40"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("stat.bestdef", "Meilleure défense")}</div>{bestDef ? <div className="mt-2 flex items-center justify-between"><ClubChip id={bestDef.club} /><b className="text-xl">{bestDef.ga}</b></div> : <p className="mt-2 text-sm text-muted">—</p>}</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-line/10 pt-4 text-center text-xs text-muted sm:grid-cols-4">
            <div><b className="block text-base text-content">{clubsList.length}</b>{L("nav.clubs", "clubs")}</div>
            <div><b className="block text-base text-content">{matches.length}</b>{L("nav.matchs", "matchs")}</div>
            <div><b className="block text-base text-content">{players.length}</b>{L("nav.joueurs", "joueurs")}</div>
            <div><b className="block text-base text-content">{seasons.length}</b>saisons</div>
          </div>
        </div>
      )}

      {tab === "matchs" && (
        <div>
          <PhaseChips />
          {rounds.length > 1 && <div className="mb-4 flex flex-wrap gap-1"><button onClick={() => setRound("all")} className={`rounded-full border px-3 py-1 text-xs ${round === "all" ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{L("filter.all", "Tout")}</button>{rounds.map((r) => <button key={r.key} onClick={() => setRound(r.key)} className={`rounded-full border px-3 py-1 text-xs ${round === r.key ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{r.num != null ? `J${r.num}` : r.label}</button>)}</div>}
          {grouped.map((g) => <div key={g.label} className="mb-5"><div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{g.label}</div><div className="space-y-2">{g.items.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}</div></div>)}
          {shownMatches.length === 0 && <p className="text-muted">{L("empty.matches", "Aucun match.")}</p>}
        </div>
      )}

      {tab === "classement" && <div><PhaseChips /><StandingsTable standings={standings} clubs={clubsMap} zones={zones} L={L} /></div>}

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
        <div className="space-y-6">
          <PhaseChips />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-xl border border-line/10 bg-surface p-4"><div className="text-2xl font-black">{phaseFinished.length}</div><div className="text-xs text-muted">{L("stat.played", "Matchs joués")}</div></div><div className="rounded-xl border border-line/10 bg-surface p-4"><div className="text-2xl font-black">{goals}</div><div className="text-xs text-muted">{L("stat.goals", "Buts")}</div></div><div className="rounded-xl border border-line/10 bg-surface p-4"><div className="text-2xl font-black">{phaseFinished.length ? (goals / phaseFinished.length).toFixed(2) : "0"}</div><div className="text-xs text-muted">{L("stat.avg", "Buts / match")}</div></div><div className="rounded-xl border border-line/10 bg-surface p-4"><div className="text-2xl font-black">{homeW}/{draw}/{awayW}</div><div className="text-xs text-muted">{L("stat.hda", "Dom/Nul/Ext")}</div></div></div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <TopCategory id="buteurs" title={L("comp.topscorer", "Buteurs")} rows={topBy("goals")} fmt={(s) => s.goals} />
            <TopCategory id="passeurs" title={L("comp.topassist", "Passeurs")} rows={topBy("assists")} fmt={(s) => s.assists} />
            <TopCategory id="minutes" title={L("stat.minutes", "Minutes")} rows={topBy("minutes")} fmt={(s) => s.minutes} />
            <TopCategory id="titu" title={L("stat.lineups", "Titularisations")} rows={topBy("lineups")} fmt={(s) => s.lineups} />
            <TopCategory id="notes" title={L("stat.ratings", "Meilleures notes")} rows={topRating} fmt={(s) => s.rating?.toFixed?.(2) ?? s.rating} meta={(s) => `${s.appearances || 0} app · ${s.minutes || 0} min`} />
            <ClubTop id="cleansheets" title={L("stat.cleansheets", "Clean sheets")} rows={cleanSheets} />
          </div>
        </div>
      )}
    </div>
  );
}
