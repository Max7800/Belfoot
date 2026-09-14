"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";

const TABS = [["overview", "Vue d'ensemble"], ["matchs", "Matchs"], ["classement", "Classement"], ["clubs", "Clubs"], ["joueurs", "Joueurs"], ["stats", "Stats"]];
const POS = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };

export default function CompetitionPage() {
  const { slug } = useParams();
  const [comp, setComp] = useState(undefined);
  const [tab, setTab] = useState("overview");
  const [seasons, setSeasons] = useState([]);
  const [matches, setMatches] = useState([]);
  const [clubsMap, setClubsMap] = useState({});
  const [standings, setStandings] = useState([]);
  const [players, setPlayers] = useState([]);
  const [pss, setPss] = useState({});
  const [md, setMd] = useState("all");

  useEffect(() => { (async () => {
    let c = (await supabase.from("competitions").select("*").eq("slug", slug).maybeSingle()).data;
    if (!c) c = (await supabase.from("competitions").select("*").eq("id", slug).maybeSingle()).data;
    if (!c) { setComp(null); return; }
    setComp(c);
    const [se, ma, st] = await Promise.all([
      supabase.from("seasons").select("*").eq("competition_id", c.id),
      supabase.from("matches").select("*").eq("competition_id", c.id).order("matchday", { ascending: true }).order("kickoff", { ascending: true }),
      supabase.from("standings").select("*").eq("competition_id", c.id).order("points", { ascending: false }),
    ]);
    setSeasons(se.data || []); setMatches(ma.data || []); setStandings(st.data || []);
    const ids = [...new Set([...(ma.data || []).flatMap((m) => [m.home_club_id, m.away_club_id]), ...(st.data || []).map((s) => s.club_id)].filter(Boolean))];
    if (ids.length) {
      const { data: cl } = await supabase.from("clubs").select("*").in("id", ids);
      setClubsMap(Object.fromEntries((cl || []).map((x) => [x.id, x])));
      const { data: pl } = await supabase.from("players").select("*").in("club_id", ids).order("name");
      setPlayers(pl || []);
      const pids = (pl || []).map((p) => p.id);
      if (pids.length) { const { data: s } = await supabase.from("player_season_stats").select("*").in("player_id", pids); setPss(Object.fromEntries((s || []).map((x) => [x.player_id, x]))); }
    }
  })().catch(() => setComp(null)); }, [slug]);

  const matchdays = useMemo(() => [...new Set(matches.map((m) => m.matchday).filter((x) => x != null))].sort((a, b) => a - b), [matches]);
  const shownMatches = md === "all" ? matches : matches.filter((m) => String(m.matchday) === String(md));
  const grouped = useMemo(() => { const g = {}; for (const m of shownMatches) { (g[m.matchday ?? "?"] ||= []).push(m); } return g; }, [shownMatches]);
  const clubName = (id) => clubsMap[id]?.name || "—";

  // Joueurs groupés par club puis poste
  const playersByClub = useMemo(() => {
    const map = new Map();
    for (const p of players) { const k = p.club_id || "__none__"; (map.get(k) || map.set(k, []).get(k)).push(p); }
    return [...map.entries()].map(([k, items]) => ({ id: k, name: k === "__none__" ? "Sans club" : clubName(k), logo: clubsMap[k]?.logo_url, items: items.sort((a, b) => (POS[a.position] ?? 9) - (POS[b.position] ?? 9) || (a.name || "").localeCompare(b.name || "")) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [players, clubsMap]);

  const topBy = (key) => players.map((p) => ({ p, st: pss[p.id] })).filter((x) => x.st && x.st[key] != null).sort((a, b) => (b.st[key] || 0) - (a.st[key] || 0)).slice(0, 10);

  if (comp === undefined) return <p className="text-muted">Chargement…</p>;
  if (comp === null) return <p className="text-muted">Compétition introuvable.</p>;
  const clubsList = Object.values(clubsMap);
  const Stat = ({ n, l }) => <div className="rounded-xl border border-line/10 bg-surface p-4"><div className="text-2xl font-black">{n}</div><div className="text-xs text-muted">{l}</div></div>;

  const finished = matches.filter((m) => m.status === "finished" && m.home_score != null);
  const goals = finished.reduce((s, m) => s + (m.home_score || 0) + (m.away_score || 0), 0);
  let homeW = 0, draw = 0, awayW = 0;
  finished.forEach((m) => { if (m.home_score > m.away_score) homeW++; else if (m.home_score === m.away_score) draw++; else awayW++; });
  const bestAtk = [...standings].sort((a, b) => b.goals_for - a.goals_for)[0];
  const bestDef = [...standings].sort((a, b) => a.goals_against - b.goals_against)[0];

  const TopList = ({ title, rows, val }) => (
    <div><h3 className="mb-2 font-bold">{title}</h3>{rows.length === 0 ? <p className="text-sm text-muted">—</p> :
      <ol className="space-y-1 text-sm">{rows.map(({ p, st }) => <li key={p.id} className="flex justify-between"><Link href={`/players/${p.id}`} className="truncate hover:text-accent">{p.name}</Link><b className="ml-2 shrink-0">{val(st)}</b></li>)}</ol>}</div>
  );

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        {comp.logo_url && <img src={comp.logo_url} className="h-14 w-14 object-contain" alt="" />}
        <div><h1 className="text-3xl font-black">{comp.name}</h1>{seasons.length > 0 && <div className="text-sm text-muted">{seasons.map((s) => s.label).join(" · ")}</div>}</div>
      </div>
      <div className="mb-6 flex flex-wrap gap-1 border-b border-line/10">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm ${tab === k ? "border-b-2 border-accent font-bold text-content" : "text-muted hover:text-content"}`}>{l}</button>)}
      </div>

      {tab === "overview" && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat n={clubsList.length} l="Clubs" /><Stat n={matches.length} l="Matchs" /><Stat n={players.length} l="Joueurs" /><Stat n={seasons.length} l="Saisons" /></div>}

      {tab === "matchs" && (
        <div>
          {matchdays.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1">
              <button onClick={() => setMd("all")} className={`rounded-full border px-3 py-1 text-xs ${md === "all" ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>Toutes</button>
              {matchdays.map((d) => <button key={d} onClick={() => setMd(d)} className={`rounded-full border px-3 py-1 text-xs ${String(md) === String(d) ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>J{d}</button>)}
            </div>
          )}
          {Object.keys(grouped).sort((a, b) => a - b).map((k) => (
            <div key={k} className="mb-5"><div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Journée {k}</div>
              <div className="space-y-2">{grouped[k].map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}</div></div>
          ))}
          {shownMatches.length === 0 && <p className="text-muted">Aucun match.</p>}
        </div>
      )}

      {tab === "classement" && (
        <div className="overflow-hidden rounded-xl border border-line/10">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-muted"><tr><th className="p-2 text-left">Club</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Diff</th><th>Pts</th></tr></thead>
            <tbody>
              {standings.map((r, i) => <tr key={r.club_id} className="border-t border-line/10 text-center"><td className="p-2 text-left"><Link href={`/clubs/${r.club_id}`} className="inline-flex items-center gap-2 hover:text-accent">{i + 1}. {clubsMap[r.club_id]?.logo_url && <img src={clubsMap[r.club_id].logo_url} className="h-5 w-5 object-contain" alt="" />}{clubName(r.club_id)}</Link></td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.goal_diff}</td><td className="font-bold">{r.points}</td></tr>)}
              {standings.length === 0 && <tr><td colSpan="7" className="p-4 text-center text-muted">Classement vide.</td></tr>}
            </tbody>
          </table>
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
          {playersByClub.map((g) => (
            <div key={g.id}>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">{g.logo && <img src={g.logo} className="h-6 w-6 object-contain" alt="" />}{g.name}<span className="text-xs font-normal text-muted">({g.items.length})</span></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((p) => (
                  <Link key={p.id} href={`/players/${p.id}`} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-3 transition hover:border-accent/40">
                    {p.photo_url && <img src={p.photo_url} className="h-11 w-11 rounded-full object-cover" alt="" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="text-xs text-muted">{[p.position, p.age ? `${p.age} ans` : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    {p.nationality && <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted/70">{p.nationality.slice(0, 3)}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          {players.length === 0 && <p className="text-muted">Aucun joueur. Lance « 👥 Effectifs » dans l'admin.</p>}
        </div>
      )}

      {tab === "stats" && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Compétition</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat n={finished.length} l="Matchs joués" /><Stat n={goals} l="Buts" />
              <Stat n={finished.length ? (goals / finished.length).toFixed(2) : "0"} l="Buts / match" /><Stat n={`${homeW}/${draw}/${awayW}`} l="Dom/Nul/Ext" />
            </div>
            {standings.length > 0 && <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted"><span>Meilleure attaque : <b className="text-content">{clubName(bestAtk?.club_id)}</b> ({bestAtk?.goals_for})</span><span>Meilleure défense : <b className="text-content">{clubName(bestDef?.club_id)}</b> ({bestDef?.goals_against})</span></div>}
          </div>
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Joueurs</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <TopList title="Buteurs" rows={topBy("goals")} val={(s) => s.goals} />
              <TopList title="Passeurs" rows={topBy("assists")} val={(s) => s.assists} />
              <TopList title="Minutes" rows={topBy("minutes")} val={(s) => s.minutes} />
              <TopList title="Titularisations" rows={topBy("lineups")} val={(s) => s.lineups} />
              <TopList title="Meilleures notes" rows={topBy("rating")} val={(s) => s.rating?.toFixed?.(2) ?? s.rating} />
              <TopList title="Cartons jaunes" rows={topBy("yellow")} val={(s) => s.yellow} />
            </div>
            {players.every((p) => !pss[p.id]) && <p className="mt-2 text-sm text-muted">Lance « 👥 Effectifs (joueurs) » pour remplir ces classements (les stats saison viennent avec l'effectif).</p>}
          </div>
        </div>
      )}
    </div>
  );
}
