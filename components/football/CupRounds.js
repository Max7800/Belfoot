"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import MatchRow from "./MatchRow";
import { isMatchFinished } from "@/lib/matchStatus";

const STAGES = [
  { rank: 0, test: /(knockout(?: round)? play-?offs?|barrages?)/i, label: "Barrages" },
  { rank: 1, test: /(round of 32|32nd|1\/16|16[eè]mes?|seizi[eè]mes?)/i, label: "16es de finale" },
  { rank: 2, test: /(round of 16|16th|1\/8|8[eè]mes?|huiti[eè]mes?)/i, label: "8es de finale" },
  { rank: 3, test: /(quarter|1\/4|quarts?)/i, label: "Quarts de finale" },
  { rank: 4, test: /(semi|1\/2|demi)/i, label: "Demi-finales" },
  { rank: 5, test: /(^|\b)final(e|s)?\b/i, reject: /(semi|demi|quarter|quart)/i, label: "Finale" },
];

function stageMeta(phase) {
  return STAGES.find((stage) => stage.test.test(phase || "") && !stage.reject?.test(phase || "")) || null;
}

function collapseTwoLeggedTies(rows) {
  const ties = new Map();
  rows.forEach((match) => {
    const clubs = [match.home_club_id, match.away_club_id].filter(Boolean).sort();
    const key = clubs.length === 2 ? clubs.join(":") : match.id;
    const tie = ties.get(key) || [];
    tie.push(match);
    ties.set(key, tie);
  });
  return [...ties.values()].map((legs) => {
    const ordered = [...legs].sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));
    if (ordered.length === 1) return ordered[0];
    const first = ordered[0];
    const latest = ordered[ordered.length - 1];
    const scoreFor = (clubId) => ordered.reduce((total, leg) => total
      + Number(leg.home_club_id === clubId ? leg.home_score : leg.away_club_id === clubId ? leg.away_score : 0), 0);
    return {
      ...latest,
      id: latest.id,
      home_club_id: first.home_club_id,
      away_club_id: first.away_club_id,
      home_score: scoreFor(first.home_club_id),
      away_score: scoreFor(first.away_club_id),
      status: ordered.every(isMatchFinished) ? "finished" : latest.status,
      legCount: ordered.length,
    };
  }).sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));
}

function orderedBracketStages(matches, phases) {
  const grouped = new Map();
  phases.forEach((phase) => {
    const meta = stageMeta(phase);
    if (!meta) return;
    const rows = collapseTwoLeggedTies(matches.filter((match) => (match.phase || "—") === phase));
    if (rows.length) grouped.set(meta.rank, { ...meta, phase, matches: rows });
  });
  const stages = [...grouped.values()].sort((a, b) => a.rank - b.rank);

  // Replace les tours précédents dans l'ordre des clubs réellement qualifiés.
  for (let index = stages.length - 2; index >= 0; index--) {
    const current = stages[index];
    const next = stages[index + 1];
    const remaining = [...current.matches];
    const ordered = [];
    next.matches.forEach((match) => {
      [match.home_club_id, match.away_club_id].filter(Boolean).forEach((clubId) => {
        const found = remaining.findIndex((candidate) => candidate.home_club_id === clubId || candidate.away_club_id === clubId);
        if (found >= 0) ordered.push(...remaining.splice(found, 1));
      });
    });
    current.matches = [...ordered, ...remaining];
  }
  return stages;
}

function BracketCard({ match, clubs, top, cardHeight, leftConnector, rightConnector, pairHeight, highlight = () => false }) {
  const home = clubs[match.home_club_id] || {};
  const away = clubs[match.away_club_id] || {};
  const finished = isMatchFinished(match) && match.home_score != null && match.away_score != null;
  const winner = finished && match.home_score !== match.away_score ? (match.home_score > match.away_score ? "home" : "away") : null;
  const team = (club, score, side, clubId) => { const hl = highlight(clubId); return <div className={`flex min-w-0 items-center gap-2 px-2 py-1.5 ${winner === side ? "bg-emerald-400/[0.08] text-emerald-200" : hl ? "bg-gradient-to-r from-red-500/[0.16] to-transparent" : ""}`}>{club.logo_url ? <img src={club.logo_url} className="h-5 w-5 shrink-0 object-contain" alt="" /> : <span className="h-5 w-5 shrink-0 rounded bg-white/[0.05]" />}<span className={`min-w-0 flex-1 truncate text-xs font-semibold ${hl ? "text-amber-100" : ""}`}>{club.name || "À déterminer"}</span>{hl && <span className="shrink-0 text-[10px]" title="Club belge">🇧🇪</span>}<b className="shrink-0 text-xs tabular-nums">{score ?? "–"}</b></div>; };
  return <div className="absolute inset-x-0" style={{ top, height: cardHeight }}>
    {leftConnector && <span className="absolute -left-5 top-1/2 w-5 border-t border-sky-400/35" />}
    {rightConnector && <span className="absolute -right-5 top-1/2 w-5 border-t border-sky-400/35" />}
    {pairHeight > 0 && <span className="absolute -right-5 top-1/2 border-r border-sky-400/35" style={{ height: pairHeight }} />}
    {match.legCount > 1 && <span className="absolute -top-2 right-2 z-10 rounded-full border border-sky-300/25 bg-surface2 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-sky-200">Cumul · {match.legCount} manches</span>}
    <Link href={`/matchs/${match.id}`} className="block overflow-hidden rounded-xl border border-line/15 bg-[linear-gradient(145deg,rgba(18,31,50,.98),rgba(7,17,31,.98))] shadow-sm transition hover:border-sky-300/45">
      {team(home, match.home_score, "home", match.home_club_id)}
      <div className="border-t border-line/10">{team(away, match.away_score, "away", match.away_club_id)}</div>
    </Link>
  </div>;
}

function Bracket({ stages, mobile = false, highlight = () => false }) {
  const shown = mobile && stages.length > 4 ? stages.slice(-4) : stages;
  const baseCount = Math.max(1, ...shown.map((stage) => stage.matches.length));
  const slotHeight = mobile ? 72 : 76;
  const cardHeight = 62;
  const height = Math.max(150, baseCount * slotHeight);
  return <div className="overflow-x-auto pb-3 [scrollbar-color:rgba(125,211,252,.35)_transparent]">
    <div className="flex min-w-max gap-10 px-1" style={{ height: height + 44 }}>
      {shown.map((stage, stageIndex) => {
        const count = stage.matches.length;
        const centers = stage.matches.map((_, index) => ((index + 0.5) * height) / count);
        return <section key={stage.rank} className="relative w-[205px] shrink-0 pt-9 sm:w-[220px]">
          <div className="absolute inset-x-0 top-0 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-200"><span className="h-1.5 w-1.5 rounded-full bg-sky-300" />{stage.label}</div>
          {stage.matches.map((match, index) => {
            const top = 36 + centers[index] - cardHeight / 2;
            const pairHeight = stageIndex < shown.length - 1 && index % 2 === 0 && centers[index + 1] != null ? centers[index + 1] - centers[index] : 0;
            return <BracketCard key={match.id} match={match} clubs={stage.clubs} top={top} cardHeight={cardHeight} leftConnector={stageIndex > 0} rightConnector={stageIndex < shown.length - 1} pairHeight={pairHeight} highlight={highlight} />;
          })}
        </section>;
      })}
    </div>
  </div>;
}

export default function CupRounds({ matches, clubs, phases, activePhase, onPhaseChange, showPhaseSelector = true, L = (key, fallback) => fallback, highlight = () => false }) {
  const selected = activePhase || phases[phases.length - 1] || null;
  const rows = matches.filter((match) => (match.phase || "—") === selected).sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));
  const bracketStages = orderedBracketStages(matches, phases).map((stage) => ({ ...stage, clubs }));

  return <div>
    <div className="mb-4 rounded-2xl border border-accent/20 bg-accent/5 p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent"><Trophy className="h-4 w-4" />{L("cup.format", "Tableau à élimination directe")}</div>
      <p className="mt-1 text-sm text-muted">{L("cup.noStandings", "Suivez le parcours des équipes jusqu'à la finale. Faites défiler le tableau horizontalement sur mobile.")}</p>
    </div>

    {bracketStages.length >= 2 && <>
      <div className="sm:hidden"><Bracket stages={bracketStages} mobile highlight={highlight} /></div>
      <div className="hidden sm:block"><Bracket stages={bracketStages} highlight={highlight} /></div>
    </>}

    <div className="mt-5 border-t border-line/10 pt-5">
      <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-muted">Tous les tours</h2>
      {showPhaseSelector && phases.length > 1 && <div className="mb-4 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">{phases.map((phase) => <button key={phase} onClick={() => onPhaseChange?.(phase)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${selected === phase ? "border-accent bg-accent/10 text-accent" : "border-line/20 text-muted"}`}>{phase}</button>)}</div>}
      {selected && <h3 className="mb-3 text-lg font-black">{selected}</h3>}
      <div className="grid gap-2 lg:grid-cols-2">{rows.map((match) => <MatchRow key={match.id} m={match} clubs={clubs} href={`/matchs/${match.id}`} />)}</div>
      {rows.length === 0 && <p className="text-muted">{L("empty.matches", "Aucun match.")}</p>}
    </div>
  </div>;
}
