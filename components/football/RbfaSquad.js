"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { rbfaPublicSnapshot } from "@/lib/rbfaPublicSelection";

const SOURCES = {
  senior: "https://static.rbfa.be/project/publiek/rencintstat/spelers_fr_145.htm",
  u21: "https://static.rbfa.be/project/publiek/rencintstat/spelers_fr_141.htm",
};

export function useRbfaSquad(team) {
  const [state, setState] = useState({ loaded: false, monitor: null });
  useEffect(() => {
    let active = true;
    supabase.from("site_settings").select("data").eq("id", 1).maybeSingle()
      .then(({ data }) => { if (active) setState({ loaded: true, monitor: data?.data?.football_rbfa_monitor || null }); })
      .catch(() => { if (active) setState({ loaded: true, monitor: null }); });
    return () => { active = false; };
  }, []);
  return { loaded: state.loaded, snapshot: rbfaPublicSnapshot(state.monitor, team) };
}

export default function RbfaSquad({ snapshot, compact = false }) {
  const rows = compact ? snapshot.players.slice(0, 8) : snapshot.players;
  const checked = new Date(snapshot.observedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" });
  return <div>
    <p className="mb-3 text-xs leading-5 text-muted">Liste publiée par la RBFA · vérifiée le {checked}. Elle peut concerner le dernier rassemblement. <a className="underline hover:text-white" href={SOURCES[snapshot.category]} target="_blank" rel="noreferrer">Voir la source</a></p>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{rows.map((row) => <div key={row.sourceId} className="flex min-w-0 items-center gap-3 rounded-xl border border-line/10 bg-surface/70 p-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2"><Users className="h-4 w-4 text-muted" /></span><div className="min-w-0"><p className="truncate text-sm font-bold">{row.name}</p><p className="truncate text-xs text-muted">{row.club}</p></div></div>)}</div>
  </div>;
}
