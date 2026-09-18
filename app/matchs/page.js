"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, List, Radio } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MatchRow from "@/components/football/MatchRow";
import SeasonCalendar from "@/components/football/SeasonCalendar";

export default function MatchsPage() {
  const [comps, setComps] = useState([]); const [cid, setCid] = useState("");
  const [matches, setMatches] = useState([]); const [clubs, setClubs] = useState({});
  const [seasons, setSeasons] = useState([]); const [seasonLabel, setSeasonLabel] = useState("");
  const [phase, setPhase] = useState(null); const [round, setRound] = useState("all");
  const [view, setView] = useState("list");
  const viewChosen = useRef(false);
  useEffect(() => { if (!viewChosen.current && window.matchMedia("(max-width: 639px)").matches) setView("calendar"); }, []);
  const chooseView = (next) => { viewChosen.current = true; setView(next); };
  useEffect(() => { supabase.from("competitions").select("*").order("name").then(({ data }) => { const arr = (data || []).filter((c) => c.public_visible !== false).sort((a, b) => (a.position ?? 999) - (b.position ?? 999)); setComps(arr); if (arr[0]) setCid(arr[0].id); }); }, []);
  useEffect(() => { if (!cid) return; (async () => {
    const [{ data: m }, { data: seasonRows }] = await Promise.all([
      supabase.from("matches").select("*").eq("competition_id", cid).order("round_number", { ascending: true, nullsFirst: false }).order("kickoff", { ascending: true }),
      supabase.from("seasons").select("*").eq("competition_id", cid),
    ]);
    setMatches(m || []); setPhase(null); setRound("all");
    const orderedSeasons = [...(seasonRows || [])].sort((a, b) => (b.label || "").localeCompare(a.label || ""));
    setSeasons(orderedSeasons); setSeasonLabel(orderedSeasons[0]?.label || "");
    const ids = [...new Set((m || []).flatMap((x) => [x.home_club_id, x.away_club_id]).filter(Boolean))];
    if (ids.length) { const { data: cl } = await supabase.from("clubs").select("id,name,logo_url").in("id", ids); setClubs(Object.fromEntries((cl || []).map((x) => [x.id, x]))); }
  })().catch(() => {}); }, [cid]);
  useEffect(() => {
    if (!cid) return undefined;
    const channel = supabase.channel(`matches-competition-${cid}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `competition_id=eq.${cid}` }, (payload) => {
        if (!payload.new?.id) return;
        setMatches((current) => current.map((match) => match.id === payload.new.id ? payload.new : match));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cid]);
  const activeSeason = seasons.find((season) => season.label === seasonLabel) || null;
  const seasonMatches = useMemo(() => {
    if (!activeSeason || !matches.some((match) => match.season_id)) return matches;
    return matches.filter((match) => match.season_id === activeSeason.id);
  }, [matches, activeSeason]);
  const phases = useMemo(() => { const c = {}; for (const m of seasonMatches) { const p = m.phase || "—"; c[p] = (c[p] || 0) + 1; } return Object.keys(c).sort((a, b) => c[b] - c[a]); }, [seasonMatches]);
  const cur = phase || phases[0] || null;
  const pm = seasonMatches.filter((m) => (m.phase || "—") === cur);
  const rounds = useMemo(() => { const seen = new Map(); for (const m of pm) { const k = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); if (!seen.has(k)) seen.set(k, { key: k, num: m.round_number, label: m.round_number != null ? `Journée ${m.round_number}` : (m.round_raw || "Tour") }); } return [...seen.values()].sort((a, b) => (a.num ?? 999) - (b.num ?? 999)); }, [pm]);
  const shown = round === "all" ? pm : pm.filter((m) => (m.round_number != null ? String(m.round_number) : (m.round_raw || "?")) === round);
  const grouped = useMemo(() => { const g = {}; for (const m of shown) { const k = m.round_number != null ? String(m.round_number) : (m.round_raw || "?"); (g[k] ||= { label: m.round_number != null ? `Journée ${m.round_number}` : (m.round_raw || "Tour"), num: m.round_number, items: [] }).items.push(m); } return Object.values(g).sort((a, b) => (a.num ?? 999) - (b.num ?? 999)); }, [shown]);
  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-accent">Calendrier Belfoot</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">Matchs</h1><p className="mt-1 text-sm text-muted">Choisis une compétition, une saison et une phase.</p></div><Link href="/direct" className="inline-flex w-fit items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:border-red-400/50"><Radio size={15} />Ouvrir le direct<ArrowRight size={14} /></Link></div>
      <div className="-mx-4 mb-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {comps.map((c) => (
            <button key={c.id} onClick={() => setCid(c.id)} className={`flex shrink-0 items-center gap-2 rounded-xl border p-2 pr-3 text-sm transition ${cid === c.id ? "border-accent bg-accent/10" : "border-line/10 bg-surface hover:border-accent/40"}`}>
              {c.logo_url && <img src={c.logo_url} className="h-7 w-7 object-contain" alt="" />}
              <span className="font-semibold">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {phases.length > 1 && <select value={cur || ""} onChange={(e) => { setPhase(e.target.value); setRound("all"); }} className="w-full rounded-xl border border-line/10 bg-surface px-3 py-2 text-sm sm:hidden">{phases.map((p) => <option key={p}>{p}</option>)}</select>}
        {phases.length > 1 && <div className="hidden flex-wrap gap-2 sm:flex">{phases.map((p) => <button key={p} onClick={() => { setPhase(p); setRound("all"); }} className={`rounded-full border px-3 py-1 text-xs ${cur === p ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{p}</button>)}</div>}
        {seasons.length > 0 && <select value={seasonLabel} onChange={(e) => { setSeasonLabel(e.target.value); setPhase(null); setRound("all"); }} className="w-full rounded-xl border border-line/10 bg-surface px-3 py-2 text-sm sm:ml-auto sm:w-auto">{seasons.map((season) => <option key={season.id}>{season.label}</option>)}</select>}
      </div>
      <div className="mb-4 flex sm:justify-end"><div className="inline-flex w-full rounded-xl border border-line/10 bg-surface p-1 sm:w-auto"><button onClick={() => chooseView("calendar")} className={`order-1 flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold sm:order-2 sm:flex-none sm:py-1.5 ${view === "calendar" ? "bg-accent text-white" : "text-muted hover:text-content"}`}><CalendarDays className="h-3.5 w-3.5" />Calendrier</button><button onClick={() => chooseView("list")} className={`order-2 flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold sm:order-1 sm:flex-none sm:py-1.5 ${view === "list" ? "bg-accent text-white" : "text-muted hover:text-content"}`}><List className="h-3.5 w-3.5" />Liste</button></div></div>
      {view === "calendar" ? <SeasonCalendar matches={pm} clubs={clubs} selectedRound={round} onRoundChange={setRound} /> : <>
        {rounds.length > 1 && <select value={round} onChange={(e) => setRound(e.target.value)} className="mb-4 w-full rounded-xl border border-line/10 bg-surface px-3 py-2 text-sm sm:hidden"><option value="all">Toutes les journées</option>{rounds.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>}
        {rounds.length > 1 && <div className="mb-4 hidden flex-wrap gap-1 sm:flex"><button onClick={() => setRound("all")} className={`rounded-full border px-3 py-1 text-xs ${round === "all" ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>Tout</button>{rounds.map((r) => <button key={r.key} onClick={() => setRound(r.key)} className={`rounded-full border px-3 py-1 text-xs ${round === r.key ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{r.num != null ? `J${r.num}` : r.label}</button>)}</div>}
        {grouped.map((g) => <div key={g.label} className="mb-5"><div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{g.label}</div><div className="space-y-2">{g.items.map((m) => <MatchRow key={m.id} m={m} clubs={clubs} href={`/matchs/${m.id}`} />)}</div></div>)}
        {shown.length === 0 && <p className="text-muted">Aucun match.</p>}
      </>}
    </div>
  );
}
