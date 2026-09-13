"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const TABS = [["overview", "Vue d'ensemble"], ["matchs", "Matchs"], ["classement", "Classement"], ["clubs", "Clubs"], ["joueurs", "Joueurs"], ["stats", "Stats"]];

export default function CompetitionPage() {
  const { slug } = useParams();
  const [comp, setComp] = useState(undefined);
  const [tab, setTab] = useState("overview");
  const [seasons, setSeasons] = useState([]);
  const [matches, setMatches] = useState([]);
  const [clubsMap, setClubsMap] = useState({});
  const [standings, setStandings] = useState([]);
  const [players, setPlayers] = useState([]);
  const [scorers, setScorers] = useState([]);
  const [assists, setAssists] = useState([]);

  useEffect(() => { (async () => {
    let c = (await supabase.from("competitions").select("*").eq("slug", slug).maybeSingle()).data;
    if (!c) c = (await supabase.from("competitions").select("*").eq("id", slug).maybeSingle()).data;
    if (!c) { setComp(null); return; }
    setComp(c);
    const [se, ma, st, sc, as] = await Promise.all([
      supabase.from("seasons").select("*").eq("competition_id", c.id),
      supabase.from("matches").select("*").eq("competition_id", c.id).order("kickoff", { ascending: false }),
      supabase.from("standings").select("*").eq("competition_id", c.id).order("points", { ascending: false }),
      supabase.from("top_scorers").select("*").eq("competition_id", c.id).order("goals", { ascending: false }).limit(20),
      supabase.from("top_assists").select("*").eq("competition_id", c.id).order("assists", { ascending: false }).limit(20),
    ]);
    setSeasons(se.data || []); setMatches(ma.data || []); setStandings(st.data || []); setScorers(sc.data || []); setAssists(as.data || []);
    const ids = [...new Set([...(ma.data || []).flatMap((m) => [m.home_club_id, m.away_club_id]), ...(st.data || []).map((s) => s.club_id)].filter(Boolean))];
    if (ids.length) {
      const { data: cl } = await supabase.from("clubs").select("*").in("id", ids);
      setClubsMap(Object.fromEntries((cl || []).map((x) => [x.id, x])));
      const { data: pl } = await supabase.from("players").select("*").in("club_id", ids);
      setPlayers(pl || []);
    }
  })().catch(() => setComp(null)); }, [slug]);

  const clubName = (id) => clubsMap[id]?.name || "—";
  const playerName = (id) => players.find((p) => p.id === id)?.name || (id ? String(id).slice(0, 6) : "—");

  if (comp === undefined) return <p className="text-muted">Chargement…</p>;
  if (comp === null) return <p className="text-muted">Compétition introuvable.</p>;
  const clubsList = Object.values(clubsMap);
  const Stat = ({ n, l }) => <div className="rounded-xl border border-line/10 bg-surface p-4"><div className="text-2xl font-black">{n}</div><div className="text-xs text-muted">{l}</div></div>;

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        {comp.logo_url && <img src={comp.logo_url} className="h-14 w-14 object-contain" alt="" />}
        <div>
          <h1 className="text-3xl font-black">{comp.name}</h1>
          {seasons.length > 0 && <div className="text-sm text-muted">{seasons.map((s) => s.label).join(" · ")}</div>}
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-1 border-b border-line/10">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm ${tab === k ? "border-b-2 border-accent font-bold text-content" : "text-muted hover:text-content"}`}>{l}</button>)}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat n={clubsList.length} l="Clubs" /><Stat n={matches.length} l="Matchs" /><Stat n={players.length} l="Joueurs" /><Stat n={seasons.length} l="Saisons" />
        </div>
      )}

      {tab === "matchs" && (
        <div className="space-y-2">
          {matches.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-3 text-sm">
              <span className="flex flex-1 items-center justify-end gap-2">{clubName(m.home_club_id)}{clubsMap[m.home_club_id]?.logo_url && <img src={clubsMap[m.home_club_id].logo_url} className="h-6 w-6 object-contain" alt="" />}</span>
              <span className="rounded bg-surface2 px-2 py-1 font-bold">{m.home_score ?? "-"} : {m.away_score ?? "-"}</span>
              <span className="flex flex-1 items-center gap-2">{clubsMap[m.away_club_id]?.logo_url && <img src={clubsMap[m.away_club_id].logo_url} className="h-6 w-6 object-contain" alt="" />}{clubName(m.away_club_id)}</span>
            </div>
          ))}
          {matches.length === 0 && <p className="text-muted">Aucun match.</p>}
        </div>
      )}

      {tab === "classement" && (
        <div className="overflow-hidden rounded-xl border border-line/10">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-muted"><tr><th className="p-2 text-left">Club</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Diff</th><th>Pts</th></tr></thead>
            <tbody>
              {standings.map((r, i) => <tr key={r.club_id} className="border-t border-line/10 text-center"><td className="p-2 text-left">{i + 1}. {clubName(r.club_id)}</td><td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.goal_diff}</td><td className="font-bold">{r.points}</td></tr>)}
              {standings.length === 0 && <tr><td colSpan="7" className="p-4 text-center text-muted">Classement vide (nécessite des matchs terminés).</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "clubs" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clubsList.map((c) => <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-3">{c.logo_url && <img src={c.logo_url} className="h-8 w-8 object-contain" alt="" />}<span className="font-semibold">{c.name}</span></div>)}
          {clubsList.length === 0 && <p className="text-muted">Aucun club.</p>}
        </div>
      )}

      {tab === "joueurs" && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((p) => <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-3 text-sm">{p.photo_url && <img src={p.photo_url} className="h-8 w-8 rounded-full object-cover" alt="" />}<span className="flex-1 font-semibold">{p.name}</span><span className="text-xs text-muted">{clubName(p.club_id)}</span></div>)}
          {players.length === 0 && <p className="text-muted">Aucun joueur (les effectifs se synchroniseront ensuite).</p>}
        </div>
      )}

      {tab === "stats" && (
        <div className="grid gap-6 sm:grid-cols-2">
          <div><h3 className="mb-2 font-bold">Buteurs</h3>{scorers.length === 0 ? <p className="text-sm text-muted">Pas encore de données (événements de match à venir).</p> : <ol className="space-y-1 text-sm">{scorers.map((s) => <li key={s.player_id} className="flex justify-between"><span>{playerName(s.player_id)}</span><b>{s.goals}</b></li>)}</ol>}</div>
          <div><h3 className="mb-2 font-bold">Passeurs</h3>{assists.length === 0 ? <p className="text-sm text-muted">Pas encore de données.</p> : <ol className="space-y-1 text-sm">{assists.map((s) => <li key={s.player_id} className="flex justify-between"><span>{playerName(s.player_id)}</span><b>{s.assists}</b></li>)}</ol>}</div>
        </div>
      )}
    </div>
  );
}
