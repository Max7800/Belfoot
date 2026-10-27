"use client";
import Link from "next/link";
import LineupPitch from "./LineupPitch";
import { positionLetter, ratingBadge, teamLineup } from "@/lib/matchLineup";

// Compositions (esprit widget API-Sports) : terrain, puis entraîneurs,
// formations, titulaires et remplaçants des deux équipes face à face.
function PlayerLine({ row, side }) {
  const letter = positionLetter(row.position);
  const rating = row.rating != null && <b className={`rounded px-1 text-[10px] leading-4 tabular-nums ${ratingBadge(row.rating)}`}>{row.rating.toFixed(1)}</b>;
  const name = <span className="min-w-0 truncate">{row.player_name || "Joueur"}{row.captain ? " (C)" : ""}</span>;
  const number = <span className="shrink-0 tabular-nums text-muted">({row.number ?? "–"})</span>;
  const pos = <b className="w-3 shrink-0 text-center text-[10px] text-muted">{letter}</b>;
  const body = side === "home" ? <>{pos}{name}{number}<span className="ml-auto">{rating}</span></> : <><span className="mr-auto">{rating}</span>{number}{name}{pos}</>;
  const cls = `flex min-w-0 items-center gap-1.5 py-1 text-xs ${side === "away" ? "justify-end text-right" : ""}`;
  return row.player_id ? <Link href={`/players/${row.player_id}`} className={`${cls} hover:text-accent`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function Section({ title, children }) {
  return <section className="border-t border-line/10 first:border-t-0">
    <h3 className="bg-white/[0.03] py-2 text-center text-[11px] font-black uppercase tracking-[0.18em] text-muted">{title}</h3>
    <div className="px-3 py-2 sm:px-4">{children}</div>
  </section>;
}

function Pair({ left, right }) {
  return <div className="grid grid-cols-2 gap-4 py-1 text-xs"><div className="min-w-0 truncate">{left || "–"}</div><div className="min-w-0 truncate text-right">{right || "–"}</div></div>;
}

function Players({ home, away }) {
  const length = Math.max(home.length, away.length);
  return <div className="grid grid-cols-2 gap-x-4">
    {Array.from({ length }, (_, index) => [<div key={`h${index}`} className="min-w-0">{home[index] && <PlayerLine row={home[index]} side="home" />}</div>, <div key={`a${index}`} className="min-w-0">{away[index] && <PlayerLine row={away[index]} side="away" />}</div>])}
  </div>;
}

export default function MatchLineups({ homeClub, awayClub, lineups = [], rows = [], labels = {}, pitchOnly = false, onOpen }) {
  const lineupFor = (club) => lineups.find((row) => row.club_id === club?.id) || null;
  const home = teamLineup({ rows: rows.filter((row) => row.club_id === homeClub?.id), lineup: lineupFor(homeClub) });
  const away = teamLineup({ rows: rows.filter((row) => row.club_id === awayClub?.id), lineup: lineupFor(awayClub) });
  // Résumé : terrain seul (rien si l'API n'a pas placé les joueurs) et lien vers l'onglet.
  if (pitchOnly) {
    if (!home.lines.length && !away.lines.length) return null;
    return <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-wider">{labels.title || "Compositions"}{(home.formation || away.formation) && <span className="ml-2 text-xs font-bold normal-case tracking-normal"><span className="text-accent">{home.formation || "–"}</span><span className="text-muted"> · </span><span className="text-amber-300">{away.formation || "–"}</span></span>}</h2>
        {onOpen && <button type="button" onClick={onOpen} className="rounded-full border border-line/15 px-3 py-1 text-xs font-bold text-muted transition hover:border-accent/40 hover:text-accent">{labels.open || "Voir les compositions complètes"} →</button>}
      </div>
      <LineupPitch home={home} away={away} />
    </section>;
  }
  if (!home.starters.length && !away.starters.length) return <div className="rounded-2xl border border-dashed border-line/15 p-5 text-center text-sm text-muted">{labels.startersEmpty || "Composition non disponible."}</div>;
  return <div className="space-y-4">
    <LineupPitch home={home} away={away} />
    <div className="overflow-hidden rounded-2xl border border-line/10 bg-surface/70">
      <div className="grid grid-cols-2 gap-4 border-b border-line/10 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">{homeClub?.logo_url && <img src={homeClub.logo_url} alt="" className="h-6 w-6 object-contain" />}<b className="truncate text-xs">{homeClub?.name || labels.home || "Domicile"}</b></div>
        <div className="flex min-w-0 items-center justify-end gap-2"><b className="truncate text-right text-xs">{awayClub?.name || labels.away || "Extérieur"}</b>{awayClub?.logo_url && <img src={awayClub.logo_url} alt="" className="h-6 w-6 object-contain" />}</div>
      </div>
      {(home.coach || away.coach) && <Section title={labels.coaches || "Entraîneurs"}><Pair left={home.coach?.name} right={away.coach?.name} /></Section>}
      <Section title={labels.formations || "Formations"}><Pair left={<b className="text-accent">{home.formation || labels.formationEmpty || "–"}</b>} right={<b className="text-amber-300">{away.formation || labels.formationEmpty || "–"}</b>} /></Section>
      <Section title={labels.starters || "Titulaires"}><Players home={home.starters} away={away.starters} /></Section>
      {(home.bench.length > 0 || away.bench.length > 0) && <Section title={labels.bench || "Remplaçants"}><Players home={home.bench} away={away.bench} /></Section>}
    </div>
  </div>;
}
