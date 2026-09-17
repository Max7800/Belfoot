"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function PlayerPage() {
  const { id } = useParams();
  const [p, setP] = useState(undefined);
  const [club, setClub] = useState(null);
  const [stats, setStats] = useState([]);
  const [competitions, setCompetitions] = useState({});
  useEffect(() => { (async () => {
    const { data: pl } = await supabase.from("players").select("*").eq("id", id).maybeSingle();
    if (!pl) { setP(null); return; }
    setP(pl);
    if (pl.club_id) { const { data: c } = await supabase.from("clubs").select("id,name,logo_url").eq("id", pl.club_id).maybeSingle(); setClub(c || null); }
    const { data: s } = await supabase.from("player_season_stats").select("*").eq("player_id", id).order("season", { ascending: false });
    setStats(s || []);
    const competitionIds = [...new Set((s || []).map((row) => row.competition_id).filter(Boolean))];
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
    </div>
  );
}
