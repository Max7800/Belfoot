"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";
import CollapsibleSection from "@/components/CollapsibleSection";
import { useClubSections } from "@/lib/clubSections";

const POS = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };

export default function ClubPage() {
  const { id } = useParams();
  const sections = useClubSections();
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
    const { data: m } = await supabase.from("matches").select("*").or(`home_club_id.eq.${id},away_club_id.eq.${id}`).order("kickoff", { ascending: false }).limit(40);
    setMatches(m || []);
    const ids = [...new Set((m || []).flatMap((x) => [x.home_club_id, x.away_club_id]).filter(Boolean))];
    if (ids.length) { const { data: cl } = await supabase.from("clubs").select("id,name,logo_url").in("id", ids); setClubsMap(Object.fromEntries((cl || []).map((x) => [x.id, x]))); }
    const { data: pl } = await supabase.from("players").select("*").eq("club_id", id).order("name"); setPlayers(pl || []);
    const { data: co } = await supabase.from("coaches").select("*").eq("club_id", id).limit(1).maybeSingle(); setCoach(co || null);
    const { data: lk } = await supabase.from("clubs").select("id,name,logo_url,team_type").or(`parent_club_id.eq.${id},id.eq.${c.parent_club_id || "00000000-0000-0000-0000-000000000000"}`); setLinked((lk || []).filter((x) => x.id !== id));
  })().catch(() => setClub(null)); }, [id]);
  if (club === undefined) return <p className="text-muted">Chargement…</p>;
  if (club === null) return <p className="text-muted">Club introuvable.</p>;

  const finished = matches.filter((m) => m.status === "finished");
  const upcoming = matches.filter((m) => m.status !== "finished").sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));
  const squad = [...players].sort((a, b) => (POS[a.position] ?? 9) - (POS[b.position] ?? 9) || (a.name || "").localeCompare(b.name || ""));

  const content = {
    squad: squad.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{squad.map((p) => <Link key={p.id} href={`/players/${p.id}`} className="rounded-2xl border border-line/10 bg-bg/40 p-3 text-center transition hover:border-accent/40"><img src={p.photo_url || ""} className="mx-auto h-14 w-14 rounded-full object-cover" alt="" /><div className="mt-1 truncate text-sm font-bold">{p.name}</div><div className="text-xs text-muted">{[p.position, p.age ? `${p.age} ans` : null].filter(Boolean).join(" · ")}</div></Link>)}</div> : <p className="text-muted">—</p>,
    linked: linked.length ? <div className="flex flex-wrap gap-2">{linked.map((t) => <Link key={t.id} href={`/clubs/${t.id}`} className="flex items-center gap-2 rounded-xl border border-line/10 bg-bg/40 p-2 pr-3 text-sm transition hover:border-accent/40">{t.logo_url && <img src={t.logo_url} className="h-6 w-6 object-contain" alt="" />}<span className="font-semibold">{t.name}</span>{t.team_type && t.team_type !== "first_team" && <span className="text-[10px] uppercase text-muted">{t.team_type}</span>}</Link>)}</div> : <p className="text-muted">—</p>,
    last: finished.length ? <div className="space-y-2">{finished.slice(0, 10).map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}</div> : <p className="text-muted">—</p>,
    next: upcoming.length ? <div className="space-y-2">{upcoming.slice(0, 10).map((m) => <MatchRow key={m.id} m={m} clubs={clubsMap} href={`/matchs/${m.id}`} />)}</div> : <p className="text-muted">Aucun match à venir.</p>,
  };
  const counts = { squad: squad.length, linked: linked.length, last: finished.length, next: upcoming.length };

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        {club.logo_url && <img src={club.logo_url} className="h-16 w-16 object-contain" alt="" />}
        <div>
          <h1 className="text-3xl font-black">{club.name}</h1>
          {club.city && <div className="text-sm text-muted">{club.city}</div>}
          {coach && <div className="mt-1 flex items-center gap-2 text-sm text-muted">{coach.photo_url && <img src={coach.photo_url} className="h-6 w-6 rounded-full object-cover" alt="" />}Entraîneur : <b className="text-content">{coach.name}</b></div>}
        </div>
      </div>
      {sections.filter((s) => s.key !== "linked" || linked.length > 0).map((s) => (
        <CollapsibleSection key={s.key} id={`club-${s.key}`} title={s.label} count={counts[s.key]}>{content[s.key]}</CollapsibleSection>
      ))}
    </div>
  );
}
