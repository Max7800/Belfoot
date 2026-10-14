"use client";
import { useEffect, useState } from "react";
import StandingsTable from "./StandingsTable";
import { groupDisplayLabel } from "@/lib/groupedStandings";

// Phase à plusieurs groupes (qualifications U21, phases de groupes) : un
// classement par groupe, plus les classements transversaux fournis par l'API
// (classement des deuxièmes). Groupes calculés par lib/groupedStandings.js.
function GroupBadge({ group }) {
  if (group.official === false) return <span className="text-[9px] font-bold uppercase text-amber-200">détecté</span>;
  if (group.kind === "ranking") return <span className="text-[9px] font-bold uppercase text-muted">officiel</span>;
  return null;
}

export default function GroupStandings({ groups, clubs, entityLabel = "Sélection", compact = false, L = (key, fallback) => fallback }) {
  const tables = groups.filter((group) => group.kind === "group");
  const rankings = groups.filter((group) => group.kind === "ranking");
  const detected = tables.some((group) => group.official === false);
  const [index, setIndex] = useState(0);
  useEffect(() => { if (index >= tables.length) setIndex(0); }, [tables.length, index]);
  if (!tables.length) return <p className="text-sm text-muted">Les groupes ne sont pas encore disponibles.</p>;

  if (compact) {
    const group = tables[index % tables.length];
    return <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.025]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-2.5 py-2">
          <button type="button" onClick={() => setIndex((value) => (value - 1 + tables.length) % tables.length)} disabled={tables.length < 2} aria-label="Groupe précédent" className="flex h-7 w-7 items-center justify-center rounded-lg border border-line/10 text-lg text-muted transition hover:text-content disabled:opacity-25">‹</button>
          <div className="text-center"><div className="text-xs font-black uppercase tracking-wider">{groupDisplayLabel(group.label, `Groupe ${index + 1}`)}</div><div className="mt-0.5 text-[9px] uppercase tracking-wider text-muted">{index + 1}/{tables.length}</div></div>
          <button type="button" onClick={() => setIndex((value) => (value + 1) % tables.length)} disabled={tables.length < 2} aria-label="Groupe suivant" className="flex h-7 w-7 items-center justify-center rounded-lg border border-line/10 text-lg text-muted transition hover:text-content disabled:opacity-25">›</button>
        </div>
        <div className="divide-y divide-white/[0.045]">{group.rows.map((row, position) => {
          const club = clubs[row.club];
          return <div key={row.club || position} className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[10px] font-black">{position + 1}</span>
            {club?.logo_url && <img src={club.logo_url} className="h-5 w-5 shrink-0 object-contain" alt="" />}
            <span className="min-w-0 flex-1 truncate text-xs font-bold">{club?.name || "—"}</span>
            <span className="text-[10px] text-muted">{row.played} J</span>
            <span className="min-w-10 rounded-md bg-white/[0.06] px-1.5 py-1 text-center text-[11px] font-black tabular-nums">{row.pts} pts</span>
          </div>;
        })}</div>
      </div>
      {tables.length > 1 && <div className="flex flex-wrap justify-center gap-1.5">{tables.map((item, position) => <button key={item.label || position} type="button" onClick={() => setIndex(position)} aria-label={`Afficher ${groupDisplayLabel(item.label, `le groupe ${position + 1}`)}`} className={`h-1.5 rounded-full transition ${position === index ? "w-5 bg-accent" : "w-1.5 bg-white/20 hover:bg-white/40"}`} />)}</div>}
      {group.official === false && <p className="text-[10px] leading-4 text-amber-200/80">Groupe reconstitué depuis les matchs : le classement officiel n’est pas disponible pour cette saison.</p>}
    </div>;
  }

  return <div className="space-y-4">
    <div><div className="text-xs font-black uppercase tracking-[0.18em] text-accent">{L("std.groups", "Phase de groupes")}</div><p className="mt-1 text-sm text-muted">Chaque équipe est classée uniquement avec les adversaires de son groupe.</p></div>
    {detected && <p className="rounded-xl border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-100">Classement officiel indisponible pour cette saison : groupes reconstitués depuis les matchs.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{tables.map((group, position) => <section key={group.label || position} className="rounded-2xl border border-line/10 bg-surface/40 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-black">{groupDisplayLabel(group.label, `Groupe ${position + 1}`)}</h3><GroupBadge group={group} /></div><StandingsTable standings={group.rows} clubs={clubs} entityLabel={entityLabel} L={L} /></section>)}</div>
    {rankings.map((group, position) => <section key={group.label || position} className="rounded-2xl border border-line/10 bg-surface/40 p-3"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-black">{groupDisplayLabel(group.label, "Classement")}</h3><GroupBadge group={group} /></div><StandingsTable standings={group.rows} clubs={clubs} entityLabel={entityLabel} L={L} /></section>)}
  </div>;
}
