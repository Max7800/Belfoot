"use client";
import Link from "next/link";
import StandingsTable from "./StandingsTable";
import { nationsLeagueGroupLabel } from "@/lib/nationsLeague";

function DivisionSwitch({ divisions, value, onChange }) {
  return <div className="flex flex-wrap gap-1.5">{divisions.map((division) => <button key={division} type="button" onClick={() => onChange(division)} className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider transition ${value === division ? "border-accent bg-accent/15 text-accent" : "border-line/15 bg-surface2 text-muted hover:text-content"}`}>Ligue {division}</button>)}</div>;
}

export default function NationsLeagueStandings({ groups, clubs, division, onDivisionChange, compact = false }) {
  const divisions = [...new Set(groups.map((group) => group.division).filter(Boolean))].sort();
  const active = divisions.includes(division) ? division : divisions[0];
  const shown = groups.filter((group) => group.division === active);
  if (!divisions.length) return <p className="text-sm text-muted">Les groupes ne sont pas encore disponibles.</p>;

  if (compact) return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <DivisionSwitch divisions={divisions} value={active} onChange={onDivisionChange} />
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{shown.length} groupe{shown.length > 1 ? "s" : ""}</span>
    </div>
    <div className="space-y-1.5">{shown.map((group, index) => {
      const leader = group.rows[0];
      const club = leader ? clubs[leader.club] : null;
      return <div key={group.label || index} className="flex items-center gap-2 rounded-xl border border-white/[0.04] bg-white/[0.035] px-2.5 py-2">
        <span className="w-16 shrink-0 text-[10px] font-black uppercase tracking-wider text-muted">{nationsLeagueGroupLabel(group.label, `Groupe ${index + 1}`)}</span>
        {club?.logo_url && <img src={club.logo_url} className="h-6 w-6 shrink-0 object-contain" alt="" />}
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{club?.name || "—"}</span>
        {leader && <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-black tabular-nums">{leader.pts} pts</span>}
      </div>;
    })}</div>
    {shown.some((group) => group.official === false) && <p className="text-[10px] leading-4 text-amber-200/80">Groupes reconstitués depuis les matchs. Une nouvelle synchronisation de base enregistrera les groupes officiels.</p>}
  </div>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-accent">Phase de ligue</div><p className="mt-1 text-sm text-muted">Chaque sélection est classée uniquement avec les adversaires de son groupe.</p></div><DivisionSwitch divisions={divisions} value={active} onChange={onDivisionChange} /></div>
    <div className="grid gap-4 lg:grid-cols-2">{shown.map((group, index) => <section key={group.label || index} className="rounded-2xl border border-line/10 bg-surface/40 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-black">Ligue {active} · {nationsLeagueGroupLabel(group.label, `Groupe ${index + 1}`)}</h3>{group.official === false && <span className="text-[9px] font-bold uppercase text-amber-200">détecté</span>}</div><StandingsTable standings={group.rows} clubs={clubs} entityLabel="Sélection" /></section>)}</div>
  </div>;
}
