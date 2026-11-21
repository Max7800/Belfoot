"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { rbfaPublicSnapshot, rbfaSquadGroups } from "@/lib/rbfaPublicSelection";
import { positionLabel } from "@/lib/positions";

const SOURCES = {
  senior: "https://static.rbfa.be/project/publiek/rencintstat/spelers_fr_145.htm",
  u21: "https://static.rbfa.be/project/publiek/rencintstat/spelers_fr_141.htm",
};

export function useRbfaSquad(team) {
  const [state, setState] = useState({ loaded: false, monitor: null, players: {}, clubs: {} });
  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error } = await supabase.from("site_settings").select("data").eq("id", 1).maybeSingle();
      if (error) throw error;
      const monitor = data?.data?.football_rbfa_monitor || null;
      const ids = [...new Set([...(monitor?.senior?.players || []), ...(monitor?.u21?.players || [])].map((row) => row.playerId).filter((id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))];
      let players = {}; let clubs = {};
      if (ids.length) {
        const result = await supabase.from("players").select("id,name,photo_url,position,club_id").in("id", ids);
        if (!result.error) {
          players = Object.fromEntries((result.data || []).map((player) => [player.id, player]));
          const clubIds = [...new Set((result.data || []).map((player) => player.club_id).filter(Boolean))];
          if (clubIds.length) {
            const clubResult = await supabase.from("clubs").select("id,name,logo_url").in("id", clubIds);
            if (!clubResult.error) clubs = Object.fromEntries((clubResult.data || []).map((club) => [club.id, club]));
          }
        }
      }
      if (active) setState({ loaded: true, monitor, players, clubs });
    }
    load().catch(() => { if (active) setState({ loaded: true, monitor: null, players: {}, clubs: {} }); });
    return () => { active = false; };
  }, []);
  const snapshot = rbfaPublicSnapshot(state.monitor, team);
  return { loaded: state.loaded, snapshot: snapshot && { ...snapshot, playerDetails: state.players, clubDetails: state.clubs } };
}

export function RbfaSquadSummary({ snapshot, accent }) {
  const groups = rbfaSquadGroups(snapshot);
  const checked = new Date(snapshot.observedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" });
  return <div><p className="mb-3 text-xs leading-5 text-muted">Liste publiée par la RBFA · vérifiée le {checked}. Elle peut concerner le dernier rassemblement. <a className="underline hover:text-white" href={SOURCES[snapshot.category]} target="_blank" rel="noreferrer">Voir la source</a></p><div className="space-y-3">{groups.map((group) => <div key={group.key} className="rounded-xl border border-line/10 bg-bg/35 px-3 py-2.5">
    {group.key !== "OTHER" && <div className="mb-1.5 flex items-center gap-2"><span className="h-3.5 w-1 rounded-full" style={{ backgroundColor: accent }} /><h3 className="text-[10px] font-black uppercase tracking-wider text-muted">{group.label} · {group.rows.length}</h3></div>}
    <p className="text-sm font-semibold leading-6 text-slate-200">{group.rows.map((row) => row.name).join(" · ")}</p>
  </div>)}</div></div>;
}

export default function RbfaSquad({ snapshot }) {
  const groups = rbfaSquadGroups(snapshot);
  const checked = new Date(snapshot.observedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" });
  return <div>
    <p className="mb-3 text-xs leading-5 text-muted">Liste publiée par la RBFA · vérifiée le {checked}. Elle peut concerner le dernier rassemblement. <a className="underline hover:text-white" href={SOURCES[snapshot.category]} target="_blank" rel="noreferrer">Voir la source</a></p>
    <div className="space-y-5">{groups.map((group) => <section key={group.key}>
      {group.key !== "OTHER" && <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-amber-300">{group.label} · {group.rows.length}</h3>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{group.rows.map((row) => {
      const player = snapshot.playerDetails?.[row.playerId];
      const club = snapshot.clubDetails?.[player?.club_id];
      return <div key={row.sourceId} className="flex min-w-0 items-center gap-3 rounded-xl border border-line/10 bg-surface/70 p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface2">{player?.photo_url ? <img src={player.photo_url} alt="" className="h-full w-full object-cover object-top" /> : <Users className="h-4 w-4 text-muted" />}</span>
        <div className="min-w-0"><p className="truncate text-sm font-bold">{player ? <Link href={`/players/${player.id}`} className="hover:text-amber-300">{row.name}</Link> : row.name}</p>
          {player?.position && <p className="truncate text-[11px] text-slate-400">{positionLabel(player.position)}</p>}
          {club ? <p className="truncate text-xs text-muted"><Link href={`/clubs/${club.id}`} className="hover:text-amber-300">{club.name}</Link>{row.club.toLocaleLowerCase() !== club.name.toLocaleLowerCase() && <span> · RBFA : {row.club}</span>}</p> : <p className="truncate text-xs text-muted">{row.club}</p>}
        </div>
      </div>;
    })}</div></section>)}</div>
  </div>;
}
