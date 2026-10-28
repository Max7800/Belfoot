"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { competitionTabs, displaySeason, matchDetails, share } from "@/lib/playerSeasonWidget";
import StatRing from "./StatRing";
import { shareTone } from "@/lib/playerSeasons";

// Statistiques d'un joueur par compétition (esprit widget API-Sports) :
// pastilles de compétitions, anneau de note, chiffres clés, puis détail des
// matchs importés en « Saison complète » (tirs, passes, duels, dribbles…).
const ratingColor = (rating) => (rating == null ? "rgba(255,255,255,0.2)" : rating >= 7.5 ? "#34d399" : rating >= 7 ? "#a3e635" : rating >= 6.5 ? "#fcd34d" : rating >= 6 ? "#fbbf24" : "#f87171");

function Tile({ value, label, sub }) {
  return <div className="rounded-xl border border-line/10 bg-bg/40 p-3 text-center"><b className="block text-2xl tabular-nums">{value}</b><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>{sub && <span className="mt-0.5 block text-[10px] text-muted">{sub}</span>}</div>;
}

function Card({ title, ring, ringLabel, ringTone, rows }) {
  return <section className="rounded-2xl border border-line/10 bg-bg/35 p-3">
    <h4 className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-muted">{title}</h4>
    <div className="flex items-center gap-3">
      {ring !== undefined && <StatRing value={ring} label={ringLabel} tone={ringTone} size={56} />}
      <dl className="min-w-0 flex-1 space-y-1 text-xs">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-2"><dt className="truncate text-muted">{label}</dt><dd className="font-bold tabular-nums">{value}</dd></div>)}</dl>
    </div>
  </section>;
}

export default function PlayerStatsWidget({ stats = [], performances = [], matches = [], competitions = {}, clubs = {}, competitionLinks = {}, goalkeeper = false }) {
  const tabs = useMemo(() => competitionTabs(stats), [stats]);
  const [selected, setSelected] = useState(null);
  const tab = tabs.find((item) => item.competitionId === selected) || tabs[0];
  const details = useMemo(() => {
    if (!tab) return null;
    const competitionOf = Object.fromEntries(matches.map((match) => [match.id, match.competition_id]));
    return matchDetails(performances.filter((row) => String(competitionOf[row.match_id] ?? row.competition_id) === String(tab.competitionId)));
  }, [tab, performances, matches]);
  if (!tab) return <p className="rounded-2xl border border-dashed border-line/15 bg-surface/40 p-5 text-sm text-muted">Pas encore de statistiques de saison.</p>;
  const competition = competitions[tab.competitionId];
  const href = competitionLinks[String(tab.competitionId)];
  const clubNames = tab.clubIds.map((id) => clubs[id]?.name).filter(Boolean).join(", ");
  return <div className="overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40">
    {tabs.length > 1 && <div className="flex gap-1 overflow-x-auto border-b border-line/10 p-2 [scrollbar-width:none]" role="tablist" aria-label="Compétitions">{tabs.map((item) => {
      const active = item.competitionId === tab.competitionId;
      const itemCompetition = competitions[item.competitionId];
      return <button key={item.competitionId} type="button" role="tab" aria-selected={active} onClick={() => setSelected(item.competitionId)} className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${active ? "border-accent/50 bg-accent/10 text-accent" : "border-line/10 text-muted hover:text-content"}`}>{itemCompetition?.logo_url && <img src={itemCompetition.logo_url} alt="" className="h-4 w-4 object-contain" />}{itemCompetition?.name || "Compétition"}<span className="rounded-full bg-white/[0.07] px-1.5 text-[9px]">{item.appearances}</span></button>;
    })}</div>}
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        {competition?.logo_url && <img src={competition.logo_url} alt="" className="h-7 w-7 object-contain" />}
        <div className="min-w-0"><div className="truncate text-sm font-black">{href ? <Link href={href} className="hover:text-accent">{competition?.name}</Link> : competition?.name || "Compétition"}</div><div className="truncate text-[11px] text-muted">{[clubNames, tab.seasons.map((season) => displaySeason(season, competition)).join(", ")].filter(Boolean).join(" · ")}</div></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex justify-center sm:px-3"><StatRing value={tab.rating == null ? null : Math.min(100, (tab.rating / 10) * 100)} text={tab.rating == null ? "–" : tab.rating.toFixed(1)} label="Note moyenne" tone={ratingColor(tab.rating)} size={84} /></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Tile value={tab.appearances} label="Matchs" sub={`${tab.lineups} titulaire${tab.lineups > 1 ? "s" : ""}`} />
          <Tile value={tab.minutes} label="Minutes" sub={tab.appearances ? `${Math.round(tab.minutes / tab.appearances)} / match` : null} />
          <Tile value={tab.goals} label="Buts" />
          <Tile value={tab.assists} label="Passes déc." />
          <div className="col-span-2 rounded-xl border border-line/10 bg-bg/40 p-3 text-center sm:col-span-1"><div className="flex items-center justify-center gap-3 text-2xl font-black tabular-nums"><span className="inline-flex items-center gap-1"><span className="inline-block h-4 w-3 rounded-[2px] bg-yellow-300" />{tab.yellow}</span><span className="inline-flex items-center gap-1"><span className="inline-block h-4 w-3 rounded-[2px] bg-red-500" />{tab.red}</span></div><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Cartons</span></div>
        </div>
      </div>
      {details ? <>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {goalkeeper && <Card title="Gardien" rows={[["Arrêts", details.goalkeeper.saves], ["Buts encaissés", details.goalkeeper.conceded]]} />}
          <Card title="Tirs" ring={share(details.shots.on, details.shots.total)} ringTone={shareTone("shots", share(details.shots.on, details.shots.total))} ringLabel="cadrés" rows={[["Tirs", details.shots.total], ["Cadrés", details.shots.on], ["Penaltys marqués", details.penalties.scored]]} />
          <Card title="Passes" ring={share(details.passes.accurate, details.passes.total)} ringTone={shareTone("passes", share(details.passes.accurate, details.passes.total))} ringLabel="réussies" rows={[["Passes", details.passes.total], ["Réussies", details.passes.accurate], ["Passes clés", details.passes.key]]} />
          <Card title="Duels" ring={share(details.duels.won, details.duels.total)} ringTone={shareTone("duels", share(details.duels.won, details.duels.total))} ringLabel="gagnés" rows={[["Duels", details.duels.total], ["Gagnés", details.duels.won]]} />
          <Card title="Dribbles" ring={share(details.dribbles.success, details.dribbles.attempts)} ringTone={shareTone("dribbles", share(details.dribbles.success, details.dribbles.attempts))} ringLabel="réussis" rows={[["Tentés", details.dribbles.attempts], ["Réussis", details.dribbles.success]]} />
          <Card title="Défense" rows={[["Tacles", details.defence.tackles], ["Interceptions", details.defence.interceptions], ["Tirs contrés", details.defence.blocks]]} />
          <Card title="Fautes" rows={[["Subies", details.fouls.drawn], ["Commises", details.fouls.committed]]} />
        </div>
        <p className="mt-3 text-[11px] text-muted">Anneaux : vert = bon, ambre = moyen, rose = faible. Détail calculé sur {details.matches} match{details.matches > 1 ? "s" : ""} détaillé{details.matches > 1 ? "s" : ""} de cette compétition.</p>
      </> : <p className="mt-4 rounded-xl border border-dashed border-line/15 p-3 text-xs text-muted">Le détail par match (tirs, passes, duels…) n’est pas encore disponible pour cette compétition.</p>}
    </div>
  </div>;
}
