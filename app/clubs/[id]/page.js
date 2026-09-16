"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";

export default function ClubPage() {
  const { id } = useParams();
  const [club, setClub] = useState(undefined);
  const [matches, setMatches] = useState([]);
  const [clubsMap, setClubsMap] = useState({});
  const [players, setPlayers] = useState([]);
  const [coach, setCoach] = useState(null);
  const [linked, setLinked] = useState([]);
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
    const { data: co } = await supabase.from("coaches").select("*").eq("club_id", id).limit(1).maybeSingle();
    setCoach(co || null);
    const { data: lk } = await supabase.from("clubs").select("id,name,logo_url,team_type").or(`parent_club_id.eq.${id},id.eq.${c.parent_club_id || "00000000-0000-0000-0000-000000000000"}`);
    setLinked((lk || []).filter((x) => x.id !== id));
  })().catch(() => setClub(null)); }, [id]);
  if (club === undefined) return <p className="text-muted">Chargement…</p>;
  if (club === null) return <p className="text-muted">Club introuvable.</p>;
  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        {club.logo_url && <img src={club.logo_url} className="h-16 w-16 object-contain" alt="" />}
        <div><h1 className="text-3xl font-black">{club.name}</h1>{club.city && <div className="text-sm text-muted">{club.city}</div>}{coach && <div className="mt-1 flex items-center gap-2 text-sm text-muted">{coach.photo_url && <img src={coach.photo_url} className="h-6 w-6 rounded-full object-cover" alt="" />}Entraîneur : <b className="text-content">{coach.name}</b></div>}</div>
      </div>
      {players.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold">Effectif</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {players.map((p) => <Link key={p.id} href={`/players/${p.id}`} className="flex items-center gap-3 rounded-xl border border-line/10 bg-surface p-3 text-sm transition hover:border-accent/40">{p.photo_url && <img src={p.photo_url} className="h-8 w-8 rounded-full object-cover" alt="" />}<span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>{p.nationality && <span className="shrink-0 text-xs text-muted">{p.nationality}</span>}</Link>)}
          </div>
        </section>
      )}
      {linked.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold">Équipes liées</h2>
          <div className="flex flex-wrap gap-2">{linked.map((t) => <Link key={t.id} href={`/clubs/${t.id}`} className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface p-2 pr-3 text-sm transition hover:border-accent/40">{t.logo_url && <img src={t.logo_url} className="h-6 w-6 object-contain" alt="" />}<span className="font-semibold">{t.name}</span>{t.team_type && t.team_type !== "first_team" && <span className="text-[10px] uppercase text-muted">{t.team_type}</span>}</Link>)}</div>
        </section>
      )}
      <section>
        <h2 className="mb-3 text-lg font-bold">Derniers matchs</h2>
        <div className="space-y-2">
          {matches.map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}
          {matches.length === 0 && <p className="text-muted">Aucun match.</p>}
        </div>
      </section>
    </div>
  );
}
