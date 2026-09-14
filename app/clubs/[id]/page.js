"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ClubPage() {
  const { id } = useParams();
  const [club, setClub] = useState(undefined);
  const [matches, setMatches] = useState([]);
  const [clubsMap, setClubsMap] = useState({});
  const [players, setPlayers] = useState([]);
  useEffect(() => { (async () => {
    const { data: c } = await supabase.from("clubs").select("*").eq("id", id).maybeSingle();
    if (!c) { setClub(null); return; }
    setClub(c);
    const { data: m } = await supabase.from("matches").select("*").or(`home_club_id.eq.${id},away_club_id.eq.${id}`).order("kickoff", { ascending: false }).limit(20);
    setMatches(m || []);
    const ids = [...new Set((m || []).flatMap((x) => [x.home_club_id, x.away_club_id]).filter(Boolean))];
    if (ids.length) { const { data: cl } = await supabase.from("clubs").select("id,name,logo_url").in("id", ids); setClubsMap(Object.fromEntries((cl || []).map((x) => [x.id, x]))); }
    const { data: pl } = await supabase.from("players").select("*").eq("club_id", id).order("name");
    setPlayers(pl || []);
  })().catch(() => setClub(null)); }, [id]);
  if (club === undefined) return <p className="text-muted">Chargement…</p>;
  if (club === null) return <p className="text-muted">Club introuvable.</p>;
  const cn = (i) => clubsMap[i]?.name || "—";
  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        {club.logo_url && <img src={club.logo_url} className="h-16 w-16 object-contain" alt="" />}
        <div><h1 className="text-3xl font-black">{club.name}</h1>{club.city && <div className="text-sm text-muted">{club.city}</div>}</div>
      </div>
      {players.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold">Joueurs</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {players.map((p) => <div key={p.id} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-3 text-sm">{p.photo_url && <img src={p.photo_url} className="h-8 w-8 rounded-full object-cover" alt="" />}<span className="flex-1 font-semibold">{p.name}</span>{p.nationality && <span className="text-xs text-muted">{p.nationality}</span>}</div>)}
          </div>
        </section>
      )}
      <section>
        <h2 className="mb-3 text-lg font-bold">Derniers matchs</h2>
        <div className="space-y-2">
          {matches.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-3 text-sm">
              <span className="flex flex-1 items-center justify-end gap-2">{cn(m.home_club_id)}{clubsMap[m.home_club_id]?.logo_url && <img src={clubsMap[m.home_club_id].logo_url} className="h-6 w-6 object-contain" alt="" />}</span>
              <span className="rounded bg-surface2 px-2 py-1 font-bold">{m.home_score ?? "-"} : {m.away_score ?? "-"}</span>
              <span className="flex flex-1 items-center gap-2">{clubsMap[m.away_club_id]?.logo_url && <img src={clubsMap[m.away_club_id].logo_url} className="h-6 w-6 object-contain" alt="" />}{cn(m.away_club_id)}</span>
            </div>
          ))}
          {matches.length === 0 && <p className="text-muted">Aucun match.</p>}
        </div>
      </section>
    </div>
  );
}
