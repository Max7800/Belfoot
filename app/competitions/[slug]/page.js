"use client";
import Link from "next/link";
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
  const [seasons, setSeasons] = useState([]);
  const [seasonLabel, setSeasonLabel] = useState("");
  const [matches, setMatches] = useState([]);
  const [clubsMap, setClubsMap] = useState({});
  const [players, setPlayers] = useState([]);
  const [pss, setPss] = useState({});
  const [phase, setPhase] = useState(null);
  const [round, setRound] = useState("all");
  const [selClub, setSelClub] = useState(null);
  const [posFilter, setPosFilter] = useState("all");

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

  const phases = useMemo(() => { const count = {}; for (const m of matches) { const p = m.phase || "—"; count[p] = (count[p] || 0) + 1; } return Object.keys(count).sort((a, b) => count[b] - count[a]); }, [matches]);
  const curPhase = phase || phases[0] || null;
  const phaseMatches = useMemo(() => matches.filter((m) => (m.phase || "—") === curPhase), [matches, curPhase]);
  const phaseFinished = phaseMatches.filter((m) => m.status === "finished" && m.home_score != null);
  const standings = useMemo(() => computeStandings(phaseFinished), [phaseFinished]);
  const rounds = useMemo(() => { const seen = new Map(); for (const m of phaseMatches) { const k = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); if (!seen.has(k)) seen.set(k, { key: k, num: m.round_number, label: m.round_number != null ? `${L("comp.round", "Journée")} ${m.round_number}` : (m.round_raw || "Tour") }); } return [...seen.values()].sort((a, b) => (a.num ?? 999) - (b.num ?? 999)); }, [phaseMatches]);
  const shownMatches = round === "all" ? phaseMatches : phaseMatches.filter((m) => (m.round_number != null ? String(m.round_number) : (m.round_raw || "?")) === round);
  const grouped = useMemo(() => { const g = {}; for (const m of shownMatches) { const k = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); (g[k] ||= { label: m.round_number != null ? `${L("comp.round", "Journée")} ${m.round_number}` : (m.round_raw || "Tour"), num: m.round_number, items: [] }).items.push(m); } return Object.values(g).sort((a, b) => (a.num ?? 999) - (b.num ?? 999)); }, [shownMatches]);

  const clubName = (id) => clubsMap[id]?.name || "—";
  const topBy = (key) => players.map((p) => ({ p, st: pss[p.id] })).filter((x) => x.st && x.st[key] != null).sort((a, b) => (b.st[key] || 0) - (a.st[key] || 0)).slice(0, 8);

  if (comp === undefined) return <p className="text-muted">Chargement…</p>;
  if (comp === null) return <p className="text-muted">Compétition introuvable.</p>;
  const clubsList = Object.values(clubsMap);
  const Stat = ({ n, l }) => <div className="rounded-xl border border-line/10 bg-surface p-4"><div className="text-2xl font-black">{n}</div><div className="text-xs text-muted">{l}</div></div>;

  const goals = phaseFinished.reduce((s, m) => s + m.home_score + m.away_score, 0);
  let homeW = 0, draw = 0, awayW = 0;
  phaseFinished.forEach((m) => { if (m.home_score > m.away_score) homeW++; else if (m.home_score === m.away_score) draw++; else awayW++; });
  const maxPlayed = Math.max(0, ...standings.map((r) => r.played));
  const eligible = standings.filter((r) => r.played >= Math.max(3, maxPlayed * 0.5));
  const bestAtk = [...eligible].sort((a, b) => b.gf - a.gf)[0];
  const bestDef = [...eligible].sort((a, b) => a.ga - b.ga)[0];
  const forms = standings.map((r) => ({ club: r.club, ...clubForm(phaseFinished, r.club) })).sort((a, b) => b.pts - a.pts);
  const inForm = forms[0];
  const topScorer = topBy("goals")[0]; const topAssist = topBy("assists")[0];
  const lastRound = Math.max(-1, ...phaseFinished.map((m) => m.round_number ?? -1));
  const lastResults = lastRound >= 0 ? phaseMatches.filter((m) => (m.round_number ?? -1) === lastRound) : [...phaseFinished].sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 10);
  const nextRound = Math.min(Infinity, ...phaseMatches.filter((m) => m.status !== "finished" && m.round_number != null).map((m) => m.round_number));
  const upcoming = Number.isFinite(nextRound) ? phaseMatches.filter((m) => m.round_number === nextRound) : [...matches].filter((m) => m.status !== "finished").sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0)).slice(0, 10);

  const ClubChip = ({ id, extra }) => <Link href={`/clubs/${id}`} className="inline-flex items-center gap-2 hover:text-accent">{clubsMap[id]?.logo_url && <img src={clubsMap[id].logo_url} className="h-5 w-5 object-contain" alt="" />}<span className="truncate">{clubName(id)}</span>{extra != null && <b className="ml-auto text-content">{extra}</b>}</Link>;
  const PlayerLine = ({ p, st, v }) => <Link href={`/players/${p.id}`} className="flex items-center gap-2 rounded-lg p-1 hover:bg-surface"><img src={p.photo_url || ""} className="h-8 w-8 rounded-full object-cover" alt="" /><span className="min-w-0 flex-1 truncate">{p.name}</span><b className="shrink-0">{v}</b></Link>;
  const Card = ({ title, link, children }) => <div className="rounded-2xl border border-line/10 bg-surface p-4"><div className="mb-2 flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-wider text-muted">{title}</div>{link && <Link href={link} className="text-xs text-accent hover:underline">{L("comp.seeall", "Voir tout")} →</Link>}</div>{children}</div>;
  const PhaseChips = () => phases.length > 1 ? <div className="mb-4 flex flex-wrap gap-1">{phases.map((ph) => <button key={ph} onClick={() => { setPhase(ph); setRound("all"); }} className={`rounded-full border px-3 py-1 text-xs ${curPhase === ph ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{ph}</button>)}</div> : null;

  return (
    <div>
      <CompetitionHeader comp={comp} seasonLabel={seasonLabel} kicker={L("comp.kicker", "Compétitions")} />
      <div className="mb-6 flex items-center justify-between gap-2 border-b border-line/10">
        <div className="flex flex-wrap gap-1">
          {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm ${tab === k ? "border-b-2 border-accent font-bold text-content" : "text-muted hover:text-content"}`}>{l}</button>)}
        </div>
        {seasons.length > 0 && <select value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} className="shrink-0 rounded border border-line/10 bg-surface px-2 py-1 text-xs">{seasons.map((s) => <option key={s.id}>{s.label}</option>)}</select>}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={L("comp.top5", "Classement")} link={`/classement`}><ol className="space-y-1 text-sm">{standings.slice(0, 5).map((r, i) => <li key={r.club} className="flex items-center gap-2"><span className="w-4 text-muted">{i + 1}</span><ClubChip id={r.club} extra={r.pts} /></li>)}{standings.length === 0 && <li className="text-muted">{L("empty.standings", "—")}</li>}</ol></Card>
            <Card title={lastRound >= 0 ? `${L("comp.results", "Résultats")} — ${L("comp.round", "Journée")} ${lastRound}` : L("comp.results", "Derniers résultats")}><div className="space-y-1">{lastResults.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}{lastResults.length === 0 && <p className="text-sm text-muted">—</p>}</div></Card>
            <Card title={Number.isFinite(nextRound) ? `${L("comp.upcoming", "Prochaine journée")} — J${nextRound}` : L("comp.upcoming", "Prochains matchs")}><div className="space-y-1">{upcoming.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}{upcoming.length === 0 && <p className="text-sm text-muted">—</p>}</div></Card>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">⚽ {L("comp.topscorer", "Meilleur buteur")}</div>{topScorer ? <Link href={`/players/${topScorer.p.id}`} className="mt-2 flex items-center gap-3"><img src={topScorer.p.photo_url || ""} className="h-12 w-12 rounded-full object-cover" alt="" /><span><b className="block">{topScorer.p.name}</b><span className="text-sm text-muted">{topScorer.st.goals} {L("unit.goals", "buts")}</span></span></Link> : <p className="mt-2 text-sm text-muted">—</p>}</div>
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">🅰️ {L("comp.topassist", "Meilleur passeur")}</div>{topAssist ? <Link href={`/players/${topAssist.p.id}`} className="mt-2 flex items-center gap-3"><img src={topAssist.p.photo_url || ""} className="h-12 w-12 rounded-full object-cover" alt="" /><span><b className="block">{topAssist.p.name}</b><span className="text-sm text-muted">{topAssist.st.assists} {L("unit.assists", "passes")}</span></span></Link> : <p className="mt-2 text-sm text-muted">—</p>}</div>
            <div className="rounded-2xl border border-line/10 bg-surface p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">🔥 {L("comp.inform", "Club en forme")}</div>{inForm ? <div className="mt-2"><ClubChip id={inForm.club} /><div className="mt-1 flex gap-1 text-xs">{inForm.res.map((r, i) => <span key={i} className={`rounded px-1 ${r === "V" ? "bg-green-500/20 text-green-400" : r === "N" ? "bg-white/10 text-muted" : "bg-red-500/20 text-red-400"}`}>{r}</span>)}</div></div> : <p className="mt-2 text-sm text-muted">—</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center text-xs text-muted">
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

      {tab === "classement" && <div><PhaseChips /><StandingsTable standings={standings} clubs={clubsMap} zones={comp.zones || []} L={L} /></div>}

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
              <button key={c.id} onClick={() => { setSelClub(c.id); setPosFilter("all"); }} className="rounded-2xl border border-line/10 bg-surface p-4 text-center transition hover:border-accent/40">
                {c.logo_url && <img src={c.logo_url} className="mx-auto h-14 w-14 object-contain" alt="" />}<div className="mt-2 font-bold">{c.name}</div><div className="text-xs text-muted">{players.filter((p) => p.club_id === c.id).length} {L("nav.joueurs", "joueurs")}</div>
              </button>
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
                {shown.map((p) => (
                  <Link key={p.id} href={`/players/${p.id}`} className="rounded-2xl border border-line/10 bg-surface p-3 text-center transition hover:border-accent/40">
                    <img src={p.photo_url || ""} className="mx-auto h-16 w-16 rounded-full object-cover" alt="" /><div className="mt-2 truncate text-sm font-bold">{p.name}</div><div className="text-xs text-muted">{[p.position, p.age ? `${p.age} ans` : null].filter(Boolean).join(" · ")}</div>{p.nationality && <div className="mt-1 text-[10px] uppercase tracking-wider text-muted/60">{p.nationality}</div>}
                  </Link>
                ))}
                {shown.length === 0 && <p className="text-muted">{L("empty.players", "Aucun joueur.")}</p>}
              </div>
            </div>
          );
        })()
      )}

      {tab === "stats" && (
        <div className="space-y-6">
          <PhaseChips />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat n={phaseFinished.length} l={L("stat.played", "Matchs joués")} /><Stat n={goals} l={L("stat.goals", "Buts")} /><Stat n={phaseFinished.length ? (goals / phaseFinished.length).toFixed(2) : "0"} l={L("stat.avg", "Buts / match")} /><Stat n={`${homeW}/${draw}/${awayW}`} l={L("stat.hda", "Dom/Nul/Ext")} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line/10 bg-surface p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("stat.bestatk", "Meilleure attaque")}</div>{bestAtk ? <div className="mt-2 flex items-center justify-between"><ClubChip id={bestAtk.club} /><b className="text-xl">{bestAtk.gf}</b></div> : <p className="mt-2 text-sm text-muted">—</p>}</div>
            <div className="rounded-2xl border border-line/10 bg-surface p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">{L("stat.bestdef", "Meilleure défense")}</div>{bestDef ? <div className="mt-2 flex items-center justify-between"><ClubChip id={bestDef.club} /><b className="text-xl">{bestDef.ga}</b></div> : <p className="mt-2 text-sm text-muted">—</p>}</div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div><h3 className="mb-2 font-bold">{L("comp.topscorer", "Buteurs")}</h3><div className="space-y-1">{topBy("goals").map(({ p, st }) => <PlayerLine key={p.id} p={p} st={st} v={st.goals} />)}{topBy("goals").length === 0 && <p className="text-sm text-muted">—</p>}</div></div>
            <div><h3 className="mb-2 font-bold">{L("comp.topassist", "Passeurs")}</h3><div className="space-y-1">{topBy("assists").map(({ p, st }) => <PlayerLine key={p.id} p={p} st={st} v={st.assists} />)}{topBy("assists").length === 0 && <p className="text-sm text-muted">—</p>}</div></div>
            <div><h3 className="mb-2 font-bold">{L("stat.minutes", "Minutes")}</h3><div className="space-y-1">{topBy("minutes").map(({ p, st }) => <PlayerLine key={p.id} p={p} st={st} v={st.minutes} />)}{topBy("minutes").length === 0 && <p className="text-sm text-muted">—</p>}</div></div>
            <div><h3 className="mb-2 font-bold">{L("stat.lineups", "Titularisations")}</h3><div className="space-y-1">{topBy("lineups").map(({ p, st }) => <PlayerLine key={p.id} p={p} st={st} v={st.lineups} />)}{topBy("lineups").length === 0 && <p className="text-sm text-muted">—</p>}</div></div>
            <div><h3 className="mb-2 font-bold">{L("stat.ratings", "Meilleures notes")}</h3><div className="space-y-1">{topBy("rating").map(({ p, st }) => <PlayerLine key={p.id} p={p} st={st} v={st.rating?.toFixed?.(2) ?? st.rating} />)}{topBy("rating").length === 0 && <p className="text-sm text-muted">—</p>}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
