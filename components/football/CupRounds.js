"use client";
import MatchRow from "./MatchRow";

export default function CupRounds({ matches, clubs, phases, activePhase, onPhaseChange, L = (k, d) => d }) {
  const selected = activePhase || phases[phases.length - 1] || null;
  const rows = matches
    .filter((m) => (m.phase || "—") === selected)
    .sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-accent/20 bg-accent/5 p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-accent">{L("cup.format", "Compétition à élimination directe")}</div>
        <p className="mt-1 text-sm text-muted">{L("cup.noStandings", "Une coupe se suit tour par tour : aucun classement à points n’est calculé.")}</p>
      </div>

      {phases.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {phases.map((phase) => (
            <button key={phase} onClick={() => onPhaseChange?.(phase)} className={`rounded-full border px-3 py-1 text-xs ${selected === phase ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>
              {phase}
            </button>
          ))}
        </div>
      )}

      {selected && <h2 className="mb-3 text-lg font-black">{selected}</h2>}
      <div className="grid gap-2 lg:grid-cols-2">
        {rows.map((match) => <MatchRow key={match.id} m={match} clubs={clubs} href={`/matchs/${match.id}`} />)}
      </div>
      {rows.length === 0 && <p className="text-muted">{L("empty.matches", "Aucun match.")}</p>}
    </div>
  );
}
