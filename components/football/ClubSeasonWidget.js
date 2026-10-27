"use client";
import Link from "next/link";
import StatRing from "./StatRing";
import { PERIODS } from "@/lib/clubSeasonWidget";

// Saison d'une équipe (esprit widget équipe API-Sports) : forme, anneaux,
// bilan domicile / extérieur, attaque et défense, buts et cartons par tranche
// de 15 minutes, plus larges victoire et défaite.
const RESULT_TONE = { V: "bg-emerald-500 text-white", N: "bg-slate-400 text-slate-950", D: "bg-red-500 text-white" };
const average = (value) => (value == null ? "–" : value.toLocaleString("fr-BE", { maximumFractionDigits: 1 }));

function SplitBar({ label, home, away }) {
  const max = Math.max(1, home + away);
  return <div className="py-1.5">
    <div className="mb-1 grid grid-cols-[2rem_1fr_2rem] items-center text-xs"><b className="text-accent tabular-nums">{home}</b><span className="text-center text-[11px] font-semibold text-muted">{label}</span><b className="text-right tabular-nums text-amber-300">{away}</b></div>
    <div className="grid grid-cols-2 gap-1"><div className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-white/[0.05]"><span className="h-full rounded-full bg-accent" style={{ width: `${(home / max) * 100}%` }} /></div><div className="h-1.5 overflow-hidden rounded-r-full bg-white/[0.05]"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${(away / max) * 100}%` }} /></div></div>
  </div>;
}

function Histogram({ title, rows, series }) {
  const max = Math.max(1, ...rows.flatMap((row) => series.map(([key]) => row[key])));
  return <section className="rounded-2xl border border-line/10 bg-bg/35 p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-[11px] font-black uppercase tracking-[0.16em] text-muted">{title}</h4><span className="flex gap-3 text-[10px] text-muted">{series.map(([key, label, color]) => <span key={key} className="inline-flex items-center gap-1"><span className={`inline-block h-2 w-2 rounded-sm ${color}`} />{label}</span>)}</span></div>
    <div className="grid grid-cols-7 items-end gap-1.5" style={{ height: 96 }}>{rows.map((row, index) => <div key={PERIODS[index]} className="flex h-full items-end justify-center gap-0.5" title={`${PERIODS[index]}′ : ${series.map(([key, label]) => `${row[key]} ${label.toLowerCase()}`).join(", ")}`}>
      {series.map(([key, , color]) => <span key={key} className={`w-full max-w-3 rounded-t ${color}`} style={{ height: `${row[key] ? Math.max(6, (row[key] / max) * 100) : 0}%` }} />)}
    </div>)}</div>
    <div className="mt-1 grid grid-cols-7 gap-1.5 text-center text-[9px] tabular-nums text-muted">{PERIODS.map((period) => <span key={period}>{period}</span>)}</div>
  </section>;
}

function Score({ entry, clubs, clubId, label, tone }) {
  if (!entry) return null;
  const { match } = entry;
  const opponent = clubs[match.home_club_id === clubId ? match.away_club_id : match.home_club_id];
  return <Link href={`/matchs/${match.id}`} className="flex items-center gap-2 rounded-xl border border-line/10 bg-bg/40 p-2.5 text-xs transition hover:border-accent/40">
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${tone}`}>{label}</span>
    <b className="tabular-nums">{entry.goalsFor} – {entry.goalsAgainst}</b>
    <span className="min-w-0 truncate text-muted">{match.home_club_id === clubId ? "contre" : "à"} {opponent?.name || "adversaire"}</span>
  </Link>;
}

export default function ClubSeasonWidget({ summary, clubs = {}, clubId, competitionName, seasonLabel }) {
  if (!summary) return <p className="text-sm text-muted">Aucune statistique disponible.</p>;
  const { home, away, total } = summary;
  const topFormation = summary.formations[0];
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted">{[competitionName, seasonLabel].filter(Boolean).join(" · ")} · {summary.played} match{summary.played > 1 ? "s" : ""}</span>
      <span className="flex items-center gap-1" aria-label="Forme (5 derniers matchs)">{summary.form.map(({ result, match }) => <Link key={match.id} href={`/matchs/${match.id}`} title={`${match.home_score}-${match.away_score}`} className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-black ${RESULT_TONE[result]}`}>{result}</Link>)}</span>
    </div>

    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line/10 bg-bg/35 p-3 sm:grid-cols-4">
      <StatRing value={summary.winShare} label="Victoires" tone="#34d399" />
      <StatRing value={summary.cleanSheetShare} label="Sans encaisser" />
      <StatRing value={topFormation?.share ?? null} label={topFormation ? `Formation ${topFormation.formation}` : "Formation"} tone="#fbbf24" />
      <StatRing value={summary.possession == null ? null : Math.round(summary.possession)} label="Possession moy." tone="#a78bfa" />
    </div>

    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-2xl border border-line/10 bg-bg/35 p-3">
        <div className="mb-1 grid grid-cols-[1fr_auto_1fr] text-[10px] font-black uppercase tracking-[0.16em]"><span className="text-accent">Domicile</span><span className="text-muted">Bilan</span><span className="text-right text-amber-300">Extérieur</span></div>
        <SplitBar label="Victoires" home={home.wins} away={away.wins} />
        <SplitBar label="Nuls" home={home.draws} away={away.draws} />
        <SplitBar label="Défaites" home={home.losses} away={away.losses} />
        <SplitBar label="Buts marqués" home={home.goalsFor} away={away.goalsFor} />
        <SplitBar label="Buts encaissés" home={home.goalsAgainst} away={away.goalsAgainst} />
        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-line/10 pt-2 text-center text-[10px] uppercase tracking-wider text-muted">
          <span><b className="block text-base normal-case text-content">{total.wins}-{total.draws}-{total.losses}</b>V-N-D</span>
          <span><b className="block text-base text-content">{average(summary.averageFor)}</b>buts / match</span>
          <span><b className="block text-base text-content">{average(summary.averageAgainst)}</b>encaissés / match</span>
        </div>
      </section>
      <div className="space-y-3">
        <Histogram title="Buts par tranche de minutes" rows={summary.goalsByPeriod} series={[["scored", "Marqués", "bg-accent"], ["conceded", "Encaissés", "bg-amber-400"]]} />
        <Histogram title="Cartons par tranche de minutes" rows={summary.cardsByPeriod} series={[["yellow", "Jaunes", "bg-yellow-300"], ["red", "Rouges", "bg-red-500"]]} />
      </div>
    </div>

    {(summary.biggestWin || summary.biggestLoss) && <div className="grid gap-2 sm:grid-cols-2">
      <Score entry={summary.biggestWin} clubs={clubs} clubId={clubId} label="Plus large victoire" tone="bg-emerald-500/15 text-emerald-300" />
      <Score entry={summary.biggestLoss} clubs={clubs} clubId={clubId} label="Plus lourde défaite" tone="bg-red-500/15 text-red-300" />
    </div>}
    <p className="text-[11px] text-muted">{summary.cleanSheets} match{summary.cleanSheets > 1 ? "s" : ""} sans encaisser, {summary.failedToScore} sans marquer{summary.shots != null ? ` · ${average(summary.shots)} tirs par match (${average(summary.shotsOnGoal)} cadrés)` : ""}.</p>
  </div>;
}
