"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fifaU17Snapshot, FIFA_U17_TEAM_ID, FIFA_U17_COMPETITION_ID } from "@/lib/fifaTournamentRoster";
import { groupByPosition, positionLabel } from "@/lib/positions";

export function useFifaTournamentSquad({ teamId, competitionId, season, current = false }) {
  const [state, setState] = useState({ loaded: false, snapshot: null });
  useEffect(() => {
    let alive = true;
    if (teamId !== FIFA_U17_TEAM_ID || (!current && (competitionId !== FIFA_U17_COMPETITION_ID || season !== "2026-2027"))) {
      setState({ loaded: true, snapshot: null }); return () => { alive = false; };
    }
    setState({ loaded: false, snapshot: null });
    (async () => {
      const { data, error } = await supabase.from("site_settings").select("data").eq("id", 1).maybeSingle();
      if (error) throw error;
      const snapshot = fifaU17Snapshot(data?.data, { teamId, competitionId, season, current });
      if (!snapshot) { if (alive) setState({ loaded: true, snapshot: null }); return; }
      const dates = [...new Set(snapshot.players.map((p) => p.birthDate).filter(Boolean))];
      const result = await supabase.from("players").select("id,name,birth_date,photo_url,position").in("birth_date", dates);
      const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ");
      const candidates = snapshot.players.map((row) => {
        const parts = normalize(row.name);
        const matches = (result.error ? [] : result.data || []).filter((player) => {
          const name = normalize(player.name);
          return player.birth_date?.slice(0, 10) === row.birthDate && name[0] === parts[0] && name.at(-1) === parts.at(-1);
        });
        return { sourceId: row.sourceId, player: matches.length === 1 ? matches[0] : null };
      });
      const linked = new Map(candidates.filter((row) => row.player && candidates.filter((other) => other.player?.id === row.player.id).length === 1).map((row) => [row.sourceId, row.player]));
      if (alive) setState({ loaded: true, snapshot: { ...snapshot, players: snapshot.players.map((row) => ({ ...row, player: linked.get(row.sourceId) || null })) } });
    })().catch(() => { if (alive) setState({ loaded: true, snapshot: null }); });
    return () => { alive = false; };
  }, [teamId, competitionId, season, current]);
  return teamId === FIFA_U17_TEAM_ID && (current || (competitionId === FIFA_U17_COMPETITION_ID && season === "2026-2027")) ? state : { loaded: true, snapshot: null };
}

export function FifaTournamentSquad({ snapshot, compact = false }) {
  const groups = groupByPosition(snapshot.players, (row) => row.position);
  return <div><p className="mb-3 text-xs text-muted">Coupe du monde U17 2026 · liste officielle <a href={snapshot.source} target="_blank" rel="noreferrer" className="underline hover:text-white">FIFA</a> · version du {new Date(snapshot.versionAt).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" })}</p>
    <div className="space-y-4">{groups.map((group) => <section key={group.key}><h3 className="mb-2 text-xs font-black uppercase tracking-wider text-amber-300">{group.label} · {group.rows.length}</h3>
      {compact ? <p className="text-sm font-semibold leading-6 text-slate-200">{group.rows.map((row) => row.name).join(" · ")}</p> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{group.rows.map((row) => <div key={row.sourceId} className="flex min-w-0 items-center gap-3 rounded-xl border border-line/10 bg-surface/70 p-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface2">{row.player?.photo_url ? <img src={row.player.photo_url} alt="" className="h-full w-full object-cover" /> : <Users className="h-4 w-4 text-muted" />}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{row.player ? <Link href={`/players/${row.player.id}`} className="hover:text-amber-300">{row.name}</Link> : row.name}</p><p className="text-xs text-muted">{positionLabel(row.position)} · {row.club}</p></div></div>)}</div>}
    </section>)}</div></div>;
}
