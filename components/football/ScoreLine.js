"use client";

import Link from "next/link";
import { isMatchFinished, matchStatusMeta } from "@/lib/matchStatus";
import { matchOutcome, sideResult } from "@/lib/matchOutcome";

// Ligne de score (page Direct, accueil) : une ligne par équipe, score à droite,
// vainqueur en vert, nul en ambre, perdant en retrait, pastille V / N / D du camp
// belge suivi, dernier fait des matchs en direct.

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function isBelgiumTeam(club) {
  const name = normalize(club?.name);
  return Boolean(club?.national_followed && club?.national_category === "senior")
    || ["belgique", "belgium", "belgie"].includes(name);
}

function eventSummary(event) {
  if (!event) return null;
  const icons = { goal: "⚽", yellow: "🟨", red: "🟥", sub: "🔁" };
  return { icon: icons[event.type] || "●", text: event.player_name || event.detail || "Mise à jour du match" };
}

// Une ligne par équipe, score à droite (lisible sur téléphone : les noms ne sont
// plus coupés à 8 lettres comme avec « domicile – score – extérieur » sur une ligne).
// Repères : vainqueur en gras avec son score sur fond vert, perdant en retrait,
// match nul : les deux scores sur fond ambre (lib/matchOutcome.js).
const SCORE_TONE = { win: "bg-emerald-400/15 text-emerald-200", draw: "bg-amber-300/15 text-amber-200", loss: "text-muted" };
function TeamLine({ club, score, outcome, live }) {
  return <div className={`flex items-center gap-2 ${outcome === "loss" ? "text-muted" : "font-bold"}`}>
    {club?.logo_url ? <img src={club.logo_url} alt="" loading="lazy" className="h-5 w-5 flex-shrink-0 object-contain" /> : <span className="h-5 w-5 flex-shrink-0 rounded-full bg-white/[0.06]" />}
    <span className="min-w-0 flex-1 truncate">{club?.name || "—"}</span>
    <span className={`min-w-[1.6rem] rounded-md px-1 text-center font-black tabular-nums ${live ? "bg-red-500/15 text-red-200" : SCORE_TONE[outcome] || ""}`}>{score ?? ""}</span>
  </div>;
}

const RESULT_TONE = { win: "bg-emerald-500 text-white", draw: "bg-amber-400 text-black", loss: "bg-red-500 text-white" };

export function ScoreRow({ match, clubs, highlighted, followedSide, latestEvent, competition = null }) {
  const status = matchStatusMeta(match);
  const finished = isMatchFinished(match);
  const scored = match.home_score != null && match.away_score != null;
  const outcome = matchOutcome(match);
  // Pastille V / N / D du camp belge suivi, sous le statut.
  const result = followedSide ? sideResult(match, followedSide) : null;
  const event = status.live ? eventSummary(latestEvent) : null;
  return <Link href={`/matchs/${match.id}`} className={`grid grid-cols-[3.2rem_minmax(0,1fr)] items-center gap-2 px-3 py-2 text-[13px] transition hover:bg-white/[0.03] ${highlighted ? "border-l-2 border-amber-300/70 bg-amber-300/[0.03]" : "border-l-2 border-transparent"}`}>
    <span className={`text-[11px] font-black tabular-nums ${status.live ? "text-red-400" : finished ? "text-muted" : "text-content/80"}`}><span className="flex flex-col items-start gap-1"><span>{status.live && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 align-middle" />}{status.compact}</span>{result && <span title={{ V: "Victoire", N: "Match nul", D: "Défaite" }[result.letter]} className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-black ${RESULT_TONE[result.outcome]}`}>{result.letter}</span>}</span></span>
    <div className="min-w-0 space-y-1">
      {competition && <div className="flex items-center gap-1.5 truncate text-[10px] text-muted">{competition.logo_url && <img src={competition.logo_url} alt="" loading="lazy" className="h-3.5 w-3.5 object-contain" />}<span className="truncate">{competition.name}</span></div>}
      <TeamLine club={clubs[match.home_club_id]} score={scored ? match.home_score : null} outcome={outcome.home} live={status.live} />
      <TeamLine club={clubs[match.away_club_id]} score={scored ? match.away_score : null} outcome={outcome.away} live={status.live} />
      {event && <div className="truncate text-[11px] text-muted">{event.icon} {latestEvent.minute != null ? `${latestEvent.minute}’ · ` : ""}{event.text}</div>}
    </div>
  </Link>;
}
