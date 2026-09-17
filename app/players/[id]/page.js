"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useLabels } from "@/lib/labels";

export default function PlayerPage() {
  const { id } = useParams();
  const [p, setP] = useState(undefined);
  const [club, setClub] = useState(null);
  const [stats, setStats] = useState([]);
  const [competitions, setCompetitions] = useState({});
  const [performances, setPerformances] = useState([]);
  const [matches, setMatches] = useState({});
  const [clubs, setClubs] = useState({});
  const { L } = useLabels();
  useEffect(() => { (async () => {
    const { data: pl } = await supabase.from("players").select("*").eq("id", id).maybeSingle();
    if (!pl) { setP(null); return; }
    setP(pl);
    if (pl.club_id) { const { data: c } = await supabase.from("clubs").select("id,name,logo_url").eq("id", pl.club_id).maybeSingle(); setClub(c || null); }
    const { data: s } = await supabase.from("player_season_stats").select("*").eq("player_id", id).order("season", { ascending: false });
    setStats(s || []);
    const { data: perfs } = await supabase.from("match_player_stats").select("*").eq("player_id", id).order("synced_at", { ascending: false }).limit(12);
    setPerformances(perfs || []);
    const matchIds = [...new Set((perfs || []).map((row) => row.match_id).filter(Boolean))];
    let matchRows = [];
    if (matchIds.length) {
      const { data } = await supabase.from("matches").select("id,competition_id,home_club_id,away_club_id,home_score,away_score,kickoff,status").in("id", matchIds);
      matchRows = data || [];
      setMatches(Object.fromEntries(matchRows.map((match) => [match.id, match])));
      const clubIds = [...new Set(matchRows.flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean))];
      if (clubIds.length) {
        const { data: clubRows } = await supabase.from("clubs").select("id,name,logo_url").in("id", clubIds);
        setClubs(Object.fromEntries((clubRows || []).map((row) => [row.id, row])));
      }
    }
    const competitionIds = [...new Set([...(s || []).map((row) => row.competition_id), ...matchRows.map((row) => row.competition_id)].filter(Boolean))];
    if (competitionIds.length) {
      const { data: rows } = await supabase.from("competitions").select("id,name").in("id", competitionIds);
      setCompetitions(Object.fromEntries((rows || []).map((competition) => [competition.id, competition.name])));
    }
  })().catch(() => setP(null)); }, [id]);
  if (p === undefined) return <p className="text-muted">Chargement…</p>;
  if (p === null) return <p className="text-muted">Joueur introuvable.</p>;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-4">
        {p.photo_url && <img src={p.photo_url} className="h-20 w-20 rounded-full object-cover" alt="" />}
        <div>
          <h1 className="text-3xl font-black">{p.name}</h1>
          <div className="text-sm text-muted">{[p.position, p.nationality, p.country, p.age ? `${p.age} ans` : null].filter(Boolean).join(" · ")}</div>
          {club && <Link href={`/clubs/${club.id}`} className="mt-1 inline-flex items-center gap-2 text-sm hover:text-accent">{club.logo_url && <img src={club.logo_url} className="h-5 w-5 object-contain" alt="" />}{club.name}</Link>}
        </div>
      </div>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Statistiques de saison</h2>
      {stats.length === 0
        ? <p className="text-sm text-muted">Pas encore de stats. Coche « Suivi Belfoot » sur ce joueur (admin) puis lance « 📊 MAJ Belges suivis ».</p>
        : <div className="overflow-x-auto rounded-xl border border-line/10"><table className="w-full min-w-[680px] text-sm"><thead className="bg-surface2 text-muted"><tr><th className="p-2 text-left">Compétition</th><th className="p-2 text-left">Saison</th><th>Matchs</th><th>Titu.</th><th>Min.</th><th>Buts</th><th>Passes</th><th>🟨</th><th>🟥</th></tr></thead>
          <tbody>{stats.map((s) => <tr key={s.id} className="border-t border-line/10 text-center"><td className="p-2 text-left font-semibold">{competitions[s.competition_id] || "Non attribuée"}</td><td className="p-2 text-left">{s.season}</td><td>{s.appearances ?? 0}</td><td>{s.lineups ?? 0}</td><td>{s.minutes ?? 0}</td><td className="font-bold">{s.goals ?? 0}</td><td>{s.assists ?? 0}</td><td>{s.yellow ?? 0}</td><td>{s.red ?? 0}</td></tr>)}</tbody></table></div>}
      {performances.length > 0 && <section className="mt-8"><h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">{L("player.recent.performances", "Dernières performances")}</h2><div className="space-y-2">{performances.map((performance) => {
        const match = matches[performance.match_id];
        if (!match) return null;
        const home = clubs[match.home_club_id]; const away = clubs[match.away_club_id];
        return <Link key={performance.id} href={`/matchs/${performance.match_id}`} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface px-3 py-2.5 transition hover:border-accent/40 hover:bg-surface2">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">{home?.logo_url && <img src={home.logo_url} className="h-6 w-6 object-contain" alt="" />}<span className="truncate">{home?.name || "—"}</span><b className="shrink-0 tabular-nums">{match.home_score ?? "–"} : {match.away_score ?? "–"}</b><span className="truncate text-right">{away?.name || "—"}</span>{away?.logo_url && <img src={away.logo_url} className="h-6 w-6 object-contain" alt="" />}</div>
          <div className="hidden shrink-0 items-center gap-2 text-xs sm:flex"><span className="text-muted">{performance.minutes ?? 0} min</span>{performance.goals > 0 && <b>⚽ {performance.goals}</b>}{performance.assists > 0 && <b className="text-sky-300">A {performance.assists}</b>}{performance.rating != null && <b className="rounded bg-accent/15 px-2 py-1 text-accent">{Number(performance.rating).toFixed(1)}</b>}</div>
        </Link>;
      })}</div></section>}
    </div>
  );
}
