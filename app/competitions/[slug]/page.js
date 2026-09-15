"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";

const TABS = [["overview", "Vue d'ensemble"], ["matchs", "Matchs"], ["classement", "Classement"], ["clubs", "Clubs"], ["joueurs", "Joueurs"], ["stats", "Stats"]];
const POS = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };

function computeStandings(ms) {
  const t = {};
  for (const m of ms) {
    if (!m.home_club_id || !m.away_club_id || m.home_score == null) continue;
    for (const [c, gf, ga] of [[m.home_club_id, m.home_score, m.away_score], [m.away_club_id, m.away_score, m.home_score]]) {
      let r = t[c]; if (!r) r = t[c] = { club: c, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 };
      r.played++; r.gf += gf; r.ga += ga;
      if (gf > ga) { r.won++; r.pts += 3; } else if (gf === ga) { r.drawn++; r.pts++; } else r.lost++;
    }
  }
  return Object.values(t).map((r) => ({ ...r, gd: r.gf - r.ga })).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}
function clubForm(ms, clubId) {
  const rel = ms.filter((m) => m.home_score != null && (m.home_club_id === clubId || m.away_club_id === clubId)).sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 5);
  let pts = 0; const res = [];
  for (const m of rel) { const home = m.home_club_id === clubId; const gf = home ? m.home_score : m.away_score, ga = home ? m.away_score : m.home_score; if (gf > ga) { pts += 3; res.push("V"); } else if (gf === ga) { pts += 1; res.push("N"); } else res.push("D"); }
  return { pts, res };
}

export default function CompetitionPage() {
  const { slug } = useParams();
  const [comp, setComp] = useState(undefined);
  const [tab, setTab] = useState("overview");
  const [seasons, setSeasons] = useState([]);
  const [matches, setMatches] = useState([]);
  const [clubsMap, setClubsMap] = useState({});
  const [players, setPlayers] = useState([]);
  const [pss, setPss] = useState({});
  const [phase, setPhase] = useState(null);
  const [round, setRound] = useState("all");

  useEffect(() => { (async () => {
    let c = (await supabase.from("competitions").select("*").eq("slug", slug).maybeSingle()).data;
    if (!c) c = (await supabase.from("competitions").select("*").eq("id", slug).maybeSingle()).data;
    if (!c) { setComp(null); return; }
    setComp(c);
    const [se, ma] = await Promise.all([
      supabase.from("seasons").select("*").eq("competition_id", c.id),
      supabase.from("matches").select("*").eq("competition_id", c.id).order("round_number", { ascending: true, nullsFirst: false }).order("kickoff", { ascending: true }),
    ]);
    setSeasons(se.data || []); setMatches(ma.data || []);
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

  // phases réelles de la saison (générique : championnat OU coupe)
  const phases = useMemo(() => {
    const count = {};
    for (const m of matches) { const p = m.phase || "—"; count[p] = (count[p] || 0) + 1; }
    return Object.keys(count).sort((a, b) => count[b] - count[a]);   // la plus fournie d'abord
  }, [matches]);
  const mainPhase = phases[0] || null;
  const curPhase = phase || mainPhase;
  const phaseMatches = useMemo(() => matches.filter((m) => (m.phase || "—") === curPhase), [matches, curPhase]);
  const phaseFinished = phaseMatches.filter((m) => m.status === "finished" && m.home_score != null);
  const standings = useMemo(() => computeStandings(phaseFinished), [phaseFinished]);

  const rounds = useMemo(() => {
    const seen = new Map();
    for (const m of phaseMatches) { const key = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); if (!seen.has(key)) seen.set(key, { key, num: m.round_number, label: m.round_number != null ? `Journée ${m.round_number}` : (m.round_raw || "Tour"), min: m.kickoff }); }
    return [...seen.values()].sort((a, b) => (a.num ?? 999) - (b.num ?? 999) || new Date(a.min || 0) - new Date(b.min || 0));
  }, [phaseMatches]);
  const shownMatches = round === "all" ? phaseMatches : phaseMatches.filter((m) => (m.round_number != null ? String(m.round_number) : (m.round_raw || "?")) === round);
  const grouped = useMemo(() => {
    const g = {};
    for (const m of shownMatches) { const key = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); (g[key] ||= { label: m.round_number != null ? `Journée ${m.round_number}` : (m.round_raw || "Tour"), num: m.round_number, items: [] }).items.push(m); }
    return Object.values(g).sort((a, b) => (a.num ?? 999) - (b.num ?? 999));
  }, [shownMatches]);

  const clubName = (id) => clubsMap[id]?.name || "—";
  const pName = (id) => players.find((p) => p.id === id)?.name || "—";
  const topBy = (key) => players.map((p) => ({ p, st: pss[p.id] })).filter((x) => x.st && x.st[key] != null).sort((a, b) => (b.st[key] || 0) - (a.st[key] || 0)).slice(0, 8);

  if (comp === undefined) return <p className="text-muted">Chargement…</p>;
  if (comp === null) return <p className="text-muted">Compétition introuvable.</p>;
  const clubsList = Object.values(clubsMap);
  const Stat = ({ n, l }) => <div className="rounded-xl border border-line/10 bg-surface p-4"><div className="text-2xl font-black">{n}</div><div className="text-xs text-muted">{l}</div></div>;

  const goals = phaseFinished.reduce((s, m) => s + m.home_score + m.away_score, 0);
  let homeW = 0, draw = 0, awayW = 0;
  phaseFinished.forEach((m) => { if (m.home_score > m.away_score) homeW++; else if (m.home_score === m.away_score) draw++; else awayW++; });
  const bestAtk = [...standings].sort((a, b) => b.gf - a.gf)[0];
  const bestDef = [...standings].sort((a, b) => a.ga - b.ga)[0];
  const forms = standings.map((r) => ({ club: r.club, ...clubForm(phaseFinished, r.club) })).sort((a, b) => b.pts - a.pts);
  const inForm = forms[0];
  const topScorer = topBy("goals")[0];
  const topAssist = topBy("assists")[0];
  const lastResults = [...phaseFinished].sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff)).slice(0, 5);
  const upcoming = [...matches].filter((m) => m.status !== "finished").sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0)).slice(0, 5);

  const ClubChip = ({ id, extra }) => <Link href={`/clubs/${id}`} className="inline-flex items-center gap-2 hover:text-accent">{clubsMap[id]?.logo_url && <img src={clubsMap[id].logo_url} className="h-5 w-5 object-contain" alt="" />}<span>{clubName(id)}</span>{extra != null && <b className="text-content">{extra}</b>}</Link>;
  const PlayerLine = ({ p, st, v }) => <Link href={`/players/${p.id}`} className="flex items-center gap-2 rounded-lg p-1 hover:bg-surface"><img src={p.photo_url || ""} className="h-8 w-8 rounded-full object-cover" alt="" /><span className="min-w-0 flex-1 truncate">{p.name}</span><b className="shrink-0">{v}</b></Link>;
  const PhaseChips = () => phases.length > 1 ? (
    <div className="mb-4 flex flex-wrap gap-1">
      {phases.map((ph) => <button key={ph} onClick={() => { setPhase(ph); setRound("all"); }} className={`rounded-full border px-3 py-1 text-xs ${curPhase === ph ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{ph}</button>)}
    </div>
  ) : null;

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        {comp.logo_url && <img src={comp.logo_url} className="h-14 w-14 object-contain" alt="" />}
        <div><h1 className="text-3xl font-black">{comp.name}</h1>{seasons.length > 0 && <div className="text-sm text-muted">{seasons.map((s) => s.label).join(" · ")}</div>}</div>
      </div>
      <div className="mb-6 flex flex-wrap gap-1 border-b border-line/10">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm ${tab === k ? "border-b-2 border-accent font-bold text-content" : "text-muted hover:text-content"}`}>{l}</button>)}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-line/10 bg-surface p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Top 5</div>
              <ol className="space-y-1 text-sm">{standings.slice(0, 5).map((r, i) => <li key={r.club} className="flex items-center justify-between"><span className="flex items-center gap-2">{i + 1}. <ClubChip id={r.club} /></span><b>{r.pts}</b></li>)}{standings.length === 0 && <li className="text-muted">—</li>}</ol>
            </div>
            <div className="rounded-2xl border border-line/10 bg-surface p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Derniers résultats</div>
              <div className="space-y-1">{lastResults.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}{lastResults.length === 0 && <p className="text-sm text-muted">—</p>}</div>
            </div>
            <div className="rounded-2xl border border-line/10 bg-surface p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Prochains matchs</div>
              <div className="space-y-1">{upcoming.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}{upcoming.length === 0 && <p className="text-sm text-muted">—</p>}</div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">⚽ Meilleur buteur</div>{topScorer ? <Link href={`/players/${topScorer.p.id}`} className="mt-2 flex items-center gap-3"><img src={topScorer.p.photo_url || ""} className="h-12 w-12 rounded-full object-cover" alt="" /><span><b className="block">{topScorer.p.name}</b><span className="text-sm text-muted">{topScorer.st.goals} buts</span></span></Link> : <p className="mt-2 text-sm text-muted">—</p>}</div>
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">🅰️ Meilleur passeur</div>{topAssist ? <Link href={`/players/${topAssist.p.id}`} className="mt-2 flex items-center gap-3"><img src={topAssist.p.photo_url || ""} className="h-12 w-12 rounded-full object-cover" alt="" /><span><b className="block">{topAssist.p.name}</b><span className="text-sm text-muted">{topAssist.st.assists} passes</span></span></Link> : <p className="mt-2 text-sm text-muted">—</p>}</div>
            <div className="rounded-2xl border border-line/10 bg-surface p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">🔥 Club en forme</div>{inForm ? <div className="mt-2"><ClubChip id={inForm.club} /><div className="mt-1 flex gap-1 text-xs">{inForm.res.map((r, i) => <span key={i} className={`rounded px-1 ${r === "V" ? "bg-green-500/20 text-green-400" : r === "N" ? "bg-white/10 text-muted" : "bg-red-500/20 text-red-400"}`}>{r}</span>)}</div></div> : <p className="mt-2 text-sm text-muted">—</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center text-xs text-muted">
            <div><b className="block text-base text-content">{clubsList.length}</b>clubs</div>
            <div><b className="block text-base text-content">{matches.length}</b>matchs</div>
            <div><b className="block text-base text-content">{players.length}</b>joueurs</div>
            <div><b className="block text-base text-content">{seasons.length}</b>saisons</div>
          </div>
        </div>
      )}

      {tab === "matchs" && (
        <div>
          <PhaseChips />
          {rounds.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1">
              <button onClick={() => setRound("all")} className={`rounded-full border px-3 py-1 text-xs ${round === "all" ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>Tout</button>
              {rounds.map((r) => <button key={r.key} onClick={() => setRound(r.key)} className={`rounded-full border px-3 py-1 text-xs ${round === r.key ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{r.num != null ? `J${r.num}` : r.label}</button>)}
            </div>
          )}
          {grouped.map((g) => (
            <div key={g.label} className="mb-5"><div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{g.label}</div>
              <div className="space-y-2">{g.items.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}</div></div>
          ))}
          {shownMatches.length === 0 && <p className="text-muted">Aucun match.</p>}
        </div>
      )}

      {tab === "classement" && (
        <div>
          <PhaseChips />
          <div className="overflow-hidden rounded-xl border border-line/10">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted"><tr><th className="p-2 text-left">Club</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Diff</th><th>Pts</th></tr></thead>
              <tbody>
                {standings.map((r, i) => <tr key={r.club} className="border-t border-line/10 text-center"><td className="p-2 text-left">{i + 1}. <ClubChip id={r.club} /></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.gd}</td><td className="font-bold">{r.pts}</td></tr>)}
                {standings.length === 0 && <tr><td colSpan="7" className="p-4 text-center text-muted">Classement vide.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "clubs" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clubsList.map((c) => <Link key={c.id} href={`/clubs/${c.id}`} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-3 transition hover:border-accent/40">{c.logo_url && <img src={c.logo_url} className="h-8 w-8 object-contain" alt="" />}<span className="font-semibold">{c.name}</span></Link>)}
          {clubsList.length === 0 && <p className="text-muted">Aucun club.</p>}
        </div>
      )}

      {tab === "joueurs" && (
        <div className="space-y-5">
          {[...new Set(players.map((p) => p.club_id || "__none__"))].map((cid) => {
            const items = players.filter((p) => (p.club_id || "__none__") === cid).sort((a, b) => (POS[a.position] ?? 9) - (POS[b.position] ?? 9) || (a.name || "").localeCompare(b.name || ""));
            return (
              <div key={cid}>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold">{clubsMap[cid]?.logo_url && <img src={clubsMap[cid].logo_url} className="h-6 w-6 object-contain" alt="" />}{cid === "__none__" ? "Sans club" : clubName(cid)}<span className="text-xs font-normal text-muted">({items.length})</span></div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {items.map((p) => (
                    <Link key={p.id} href={`/players/${p.id}`} className="group rounded-2xl border border-line/10 bg-surface p-3 text-center transition hover:border-accent/40">
                      <img src={p.photo_url || ""} className="mx-auto h-16 w-16 rounded-full object-cover" alt="" />
                      <div className="mt-2 truncate text-sm font-bold">{p.name}</div>
                      <div className="text-xs text-muted">{[p.position, p.age ? `${p.age} ans` : null].filter(Boolean).join(" · ")}</div>
                      {p.nationality && <div className="mt-1 text-[10px] uppercase tracking-wider text-muted/60">{p.nationality}</div>}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
          {players.length === 0 && <p className="text-muted">Aucun joueur. Lance « 👥 Effectifs » dans l'admin.</p>}
        </div>
      )}

      {tab === "stats" && (
        <div className="space-y-6">
          <PhaseChips />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat n={phaseFinished.length} l="Matchs joués" /><Stat n={goals} l="Buts" />
            <Stat n={phaseFinished.length ? (goals / phaseFinished.length).toFixed(2) : "0"} l="Buts / match" /><Stat n={`${homeW}/${draw}/${awayW}`} l="Dom/Nul/Ext" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line/10 bg-surface p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">Meilleure attaque</div>{bestAtk ? <div className="mt-2 flex items-center justify-between"><ClubChip id={bestAtk.club} /><b className="text-xl">{bestAtk.gf}</b></div> : <p className="mt-2 text-sm text-muted">—</p>}</div>
            <div className="rounded-2xl border border-line/10 bg-surface p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted">Meilleure défense</div>{bestDef ? <div className="mt-2 flex items-center justify-between"><ClubChip id={bestDef.club} /><b className="text-xl">{bestDef.ga}</b></div> : <p className="mt-2 text-sm text-muted">—</p>}</div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div><h3 className="mb-2 font-bold">Buteurs</h3><div className="space-y-1">{topBy("goals").map(({ p, st }) => <PlayerLine key={p.id} p={p} st={st} v={st.goals} />)}{topBy("goals").length === 0 && <p className="text-sm text-muted">—</p>}</div></div>
            <div><h3 className="mb-2 font-bold">Passeurs</h3><div className="space-y-1">{topBy("assists").map(({ p, st }) => <PlayerLine key={p.id} p={p} st={st} v={st.assists} />)}{topBy("assists").length === 0 && <p className="text-sm text-muted">—</p>}</div></div>
            <div><h3 className="mb-2 font-bold">Minutes</h3><div className="space-y-1">{topBy("minutes").map(({ p, st }) => <PlayerLine key={p.id} p={p} st={st} v={st.minutes} />)}{topBy("minutes").length === 0 && <p className="text-sm text-muted">—</p>}</div></div>
            <div><h3 className="mb-2 font-bold">Titularisations</h3><div className="space-y-1">{topBy("lineups").map(({ p, st }) => <PlayerLine key={p.id} p={p} st={st} v={st.lineups} />)}{topBy("lineups").length === 0 && <p className="text-sm text-muted">—</p>}</div></div>
            <div><h3 className="mb-2 font-bold">Meilleures notes</h3><div className="space-y-1">{topBy("rating").map(({ p, st }) => <PlayerLine key={p.id} p={p} st={st} v={st.rating?.toFixed?.(2) ?? st.rating} />)}{topBy("rating").length === 0 && <p className="text-sm text-muted">—</p>}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
