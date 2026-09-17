"use client";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import MatchRow from "./MatchRow";

function toTime(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(time) ? null : time;
}
function matchDate(value) {
  if (!value) return "Date à confirmer";
  return new Date(value).toLocaleString("fr-BE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function rangeLabel(matches) {
  const values = matches.map((match) => toTime(match.kickoff)).filter((value) => value != null).sort((a, b) => a - b);
  if (!values.length) return "Dates à confirmer";
  const first = new Date(values[0]); const last = new Date(values[values.length - 1]);
  const format = (date) => date.toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" });
  return first.toDateString() === last.toDateString() ? format(first) : `${format(first)} — ${format(last)}`;
}

export default function SeasonCalendar({ matches = [], clubs = {}, selectedRound = "all", onRoundChange, roundWord = "Journée" }) {
  const grouped = new Map();
  for (const match of matches) {
    const key = match.round_number != null ? String(match.round_number) : (match.round_raw || match.phase || "Tour");
    const group = grouped.get(key) || { key, number: match.round_number, label: match.round_number != null ? `${roundWord} ${match.round_number}` : (match.round_raw || match.phase || "Tour"), matches: [] };
    group.matches.push(match); grouped.set(key, group);
  }
  const groups = [...grouped.values()].sort((a, b) => {
    if (a.number != null && b.number != null) return a.number - b.number;
    const ad = Math.min(...a.matches.map((match) => toTime(match.kickoff) ?? Infinity));
    const bd = Math.min(...b.matches.map((match) => toTime(match.kickoff) ?? Infinity));
    return ad - bd;
  });
  const automatic = groups.find((group) => group.matches.some((match) => match.status !== "finished")) || groups[groups.length - 1];
  const activeKey = selectedRound !== "all" && groups.some((group) => group.key === selectedRound) ? selectedRound : automatic?.key;
  const activeIndex = Math.max(0, groups.findIndex((group) => group.key === activeKey));
  const active = groups[activeIndex];
  if (!active) return <div className="rounded-2xl border border-dashed border-line/20 bg-surface/50 p-8 text-center text-sm text-muted">Aucune rencontre dans cette phase.</div>;
  const finished = active.matches.filter((match) => match.status === "finished").length;
  const live = active.matches.filter((match) => match.status === "live").length;
  const statusOf = (group) => group.matches.some((match) => match.status === "live") ? "live" : group.matches.every((match) => match.status === "finished") ? "finished" : "upcoming";

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {groups.map((group) => { const status = statusOf(group); const activeGroup = group.key === active.key; return (
          <button key={group.key} onClick={() => onRoundChange?.(group.key)} className={`min-w-[76px] shrink-0 rounded-xl border px-3 py-2 text-left transition ${activeGroup ? "border-accent bg-accent/10" : "border-line/10 bg-surface hover:border-accent/35"}`}>
            <span className={`mb-1 block h-1.5 w-1.5 rounded-full ${status === "live" ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]" : status === "finished" ? "bg-emerald-400" : "bg-amber-300"}`} />
            <b className="block truncate text-xs">{group.number != null ? `J${group.number}` : group.label}</b>
            <span className="text-[10px] text-muted">{group.matches.length} matchs</span>
          </button>
        ); })}
      </div>

      <section className="overflow-hidden rounded-3xl border border-line/10 bg-gradient-to-b from-surface to-bg/45 shadow-[0_22px_55px_-38px_rgba(0,0,0,0.95)]">
        <header className="flex items-center gap-3 border-b border-line/10 bg-white/[0.025] p-4 sm:p-5">
          <button disabled={activeIndex === 0} onClick={() => onRoundChange?.(groups[activeIndex - 1]?.key)} className="rounded-xl border border-line/10 p-2 text-muted transition hover:border-accent/40 hover:text-content disabled:cursor-not-allowed disabled:opacity-25" aria-label="Journée précédente"><ChevronLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 text-center"><div className="flex items-center justify-center gap-2 text-lg font-black"><CalendarDays className="h-5 w-5 text-accent" />{active.label}</div><div className="mt-1 text-xs text-muted">{rangeLabel(active.matches)} · {finished}/{active.matches.length} terminés{live ? ` · ${live} en direct` : ""}</div></div>
          <button disabled={activeIndex >= groups.length - 1} onClick={() => onRoundChange?.(groups[activeIndex + 1]?.key)} className="rounded-xl border border-line/10 p-2 text-muted transition hover:border-accent/40 hover:text-content disabled:cursor-not-allowed disabled:opacity-25" aria-label="Journée suivante"><ChevronRight className="h-5 w-5" /></button>
        </header>
        <div className="space-y-3 p-3 sm:p-5">
          {[...active.matches].sort((a, b) => (toTime(a.kickoff) ?? Infinity) - (toTime(b.kickoff) ?? Infinity)).map((match) => (
            <div key={match.id}>
              <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{matchDate(match.kickoff)}</div>
              <MatchRow m={match} clubs={clubs} href={`/matchs/${match.id}`} />
            </div>
          ))}
        </div>
      </section>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] uppercase tracking-wider text-muted"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-400" />Terminé</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-300" />À venir</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-red-500" />Direct</span></div>
    </div>
  );
}
