"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { computeStandings } from "@/lib/standings";
import { competitionPhases, getCompetitionType } from "@/lib/competitionType";
import StandingsTable from "@/components/football/StandingsTable";
import CupRounds from "@/components/football/CupRounds";
import { useLabels } from "@/lib/labels";

export default function ClassementPage() {
  const L = useLabels();
  const [comps, setComps] = useState([]); const [cid, setCid] = useState("");
  const [matches, setMatches] = useState([]); const [clubs, setClubs] = useState({}); const [phase, setPhase] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { supabase.from("competitions").select("*").order("name").then(({ data, error: loadError }) => {
    if (loadError) { setError(loadError.message); return; }
    const arr = (data || []).sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (a.name || "").localeCompare(b.name || ""));
    setComps(arr); if (arr[0]) setCid(arr[0].id);
  }); }, []);
  useEffect(() => { if (!cid) return; (async () => {
    setError(""); setClubs({}); setMatches([]);
    const { data: m, error: matchError } = await supabase.from("matches").select("*").eq("competition_id", cid);
    if (matchError) throw matchError;
    setMatches(m || []); setPhase(null);
    const ids = [...new Set((m || []).flatMap((x) => [x.home_club_id, x.away_club_id]).filter(Boolean))];
    if (ids.length) { const { data: cl } = await supabase.from("clubs").select("id,name,logo_url").in("id", ids); setClubs(Object.fromEntries((cl || []).map((x) => [x.id, x]))); }
  })().catch((e) => setError(e.message || String(e))); }, [cid]);
  const comp = comps.find((c) => c.id === cid) || null;
  const type = getCompetitionType(comp, matches);
  const isCup = type === "cup";
  const phases = useMemo(() => competitionPhases(matches, type), [matches, type]);
  const cur = phase || (isCup ? phases[phases.length - 1] : phases[0]) || null;
  const finished = matches.filter((m) => (m.phase || "—") === cur && m.status === "finished" && m.home_score != null);
  const standings = useMemo(() => isCup ? [] : computeStandings(finished), [finished, isCup]);
  const zones = comp?.zones || [];
  return (
    <div>
      <h1 className="mb-4 text-3xl font-black">{L("nav.classement", "Classement")}</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {comps.map((c) => (
          <button key={c.id} onClick={() => setCid(c.id)} className={`flex items-center gap-2 rounded-xl border p-2 pr-3 text-sm transition ${cid === c.id ? "border-accent bg-accent/10" : "border-line/10 bg-surface hover:border-accent/40"}`}>
            {c.logo_url && <img src={c.logo_url} className="h-7 w-7 object-contain" alt="" />}<span className="font-semibold">{c.name}</span>
            {getCompetitionType(c) === "cup" && <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">Coupe</span>}
          </button>
        ))}
      </div>
      {error && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {isCup ? (
        <div>
          <CupRounds matches={matches} clubs={clubs} phases={phases} activePhase={cur} onPhaseChange={setPhase} L={L} />
          {comp && <Link href={`/competitions/${comp.slug || comp.id}`} className="mt-4 inline-flex rounded-xl border border-accent/30 px-3 py-2 text-sm font-semibold text-accent hover:bg-accent/10">Voir la page complète de la coupe →</Link>}
        </div>
      ) : (
        <>
          {phases.length > 1 && <div className="mb-4 flex flex-wrap gap-1">{phases.map((p) => <button key={p} onClick={() => setPhase(p)} className={`rounded-full border px-3 py-1 text-xs ${cur === p ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{p}</button>)}</div>}
          <StandingsTable standings={standings} clubs={clubs} zones={zones} L={L} />
        </>
      )}
    </div>
  );
}
