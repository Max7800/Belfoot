"use client";
import { useEffect, useState } from "react";
import StandingsTable from "./StandingsTable";
import { nationsLeagueGroupLabel } from "@/lib/nationsLeague";

function DivisionSwitch({ divisions, value, onChange }) {
  return <div className="flex flex-wrap gap-1.5">{divisions.map((division) => <button key={division} type="button" onClick={() => onChange(division)} className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider transition ${value === division ? "border-accent bg-accent/15 text-accent" : "border-line/15 bg-surface2 text-muted hover:text-content"}`}>Ligue {division}</button>)}</div>;
}

export default function NationsLeagueStandings({ groups, clubs, division, onDivisionChange, compact = false }) {
  const divisions = [...new Set(groups.map((group) => group.division).filter(Boolean))].sort();
  const active = divisions.includes(division) ? division : divisions[0];
  const shown = groups.filter((group) => group.division === active);
  const [groupIndex, setGroupIndex] = useState(0);
  useEffect(() => { setGroupIndex(0); }, [active]);
  useEffect(() => { if (shown.length && groupIndex >= shown.length) setGroupIndex(0); }, [shown.length, groupIndex]);
  if (!divisions.length) return <p className="text-sm text-muted">Les groupes ne sont pas encore disponibles.</p>;

  if (compact) {
    const selectedGroup = shown[groupIndex % Math.max(1, shown.length)];
    return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <DivisionSwitch divisions={divisions} value={active} onChange={onDivisionChange} />
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{shown.length} groupe{shown.length > 1 ? "s" : ""}</span>
    </div>
    {selectedGroup && <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.025]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-2.5 py-2">
        <button type="button" onClick={() => setGroupIndex((index) => (index - 1 + shown.length) % shown.length)} disabled={shown.length < 2} aria-label="Groupe précédent" className="flex h-7 w-7 items-center justify-center rounded-lg border border-line/10 text-lg text-muted transition hover:text-content disabled:opacity-25">‹</button>
        <div className="text-center"><div className="text-xs font-black uppercase tracking-wider">{nationsLeagueGroupLabel(selectedGroup.label, `Groupe ${groupIndex + 1}`)}</div><div className="mt-0.5 text-[9px] uppercase tracking-wider text-muted">Ligue {active} · {groupIndex + 1}/{shown.length}</div></div>
        <button type="button" onClick={() => setGroupIndex((index) => (index + 1) % shown.length)} disabled={shown.length < 2} aria-label="Groupe suivant" className="flex h-7 w-7 items-center justify-center rounded-lg border border-line/10 text-lg text-muted transition hover:text-content disabled:opacity-25">›</button>
      </div>
      <div className="divide-y divide-white/[0.045]">{selectedGroup.rows.map((row, index) => {
        const club = clubs[row.club];
        return <div key={row.club || index} className="flex items-center gap-2 px-2.5 py-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[10px] font-black">{row.rank || index + 1}</span>
          {club?.logo_url && <img src={club.logo_url} className="h-5 w-5 shrink-0 object-contain" alt="" />}
          <span className="min-w-0 flex-1 truncate text-xs font-bold">{club?.name || "—"}</span>
          <span className="text-[10px] text-muted">{row.played} J</span>
          <span className="min-w-10 rounded-md bg-white/[0.06] px-1.5 py-1 text-center text-[11px] font-black tabular-nums">{row.pts} pts</span>
        </div>;
      })}</div>
    </div>}
    {shown.length > 1 && <div className="flex justify-center gap-1.5">{shown.map((group, index) => <button key={group.label || index} type="button" onClick={() => setGroupIndex(index)} aria-label={`Afficher le groupe ${index + 1}`} className={`h-1.5 rounded-full transition ${index === groupIndex ? "w-5 bg-accent" : "w-1.5 bg-white/20 hover:bg-white/40"}`} />)}</div>}
    {selectedGroup?.official === false && <p className="text-[10px] leading-4 text-amber-200/80">Groupe reconstitué depuis les matchs. Une nouvelle synchronisation de base enregistrera les groupes officiels.</p>}
  </div>;
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-accent">Phase de ligue</div><p className="mt-1 text-sm text-muted">Chaque sélection est classée uniquement avec les adversaires de son groupe.</p></div><DivisionSwitch divisions={divisions} value={active} onChange={onDivisionChange} /></div>
    <div className="grid gap-4 lg:grid-cols-2">{shown.map((group, index) => <section key={group.label || index} className="rounded-2xl border border-line/10 bg-surface/40 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-black">Ligue {active} · {nationsLeagueGroupLabel(group.label, `Groupe ${index + 1}`)}</h3>{group.official === false && <span className="text-[9px] font-bold uppercase text-amber-200">détecté</span>}</div><StandingsTable standings={group.rows} clubs={clubs} entityLabel="Sélection" /></section>)}</div>
  </div>;
}
