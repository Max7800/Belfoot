"use client";
import Link from "next/link";
import { positionLetter, ratingBadge } from "@/lib/matchLineup";

// Composition sur le terrain (esprit widget API-Sports) : domicile à gauche,
// extérieur à droite sur grand écran ; domicile en haut, extérieur en bas sur
// mobile. Les lignes viennent de la grille API (« ligne:colonne »).
const FALLBACK = { home: { shirt: "rgb(var(--accent))", number: "#ffffff", border: "rgb(var(--accent))" }, away: { shirt: "#fbbf24", number: "#0f172a", border: "#fbbf24" } };

const shortName = (name) => {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.length > 1 && /^[A-ZÀ-Ý]\.$/.test(parts[0]) ? parts.slice(1).join(" ") : parts.join(" ");
};

function Shirt({ colors, number }) {
  return <span className="relative block h-9 w-9 sm:h-10 sm:w-10">
    <svg viewBox="0 0 24 24" className="h-full w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]" aria-hidden><path d="M8 2.5 3 5.5l2.2 4.3L7 9v12.5h10V9l1.8.8L21 5.5l-5-3c-.7 1.3-2.2 2.1-4 2.1s-3.3-.8-4-2.1Z" fill={colors.shirt} stroke={colors.border} strokeWidth="1" strokeLinejoin="round" /></svg>
    <span className="absolute inset-x-0 top-[38%] text-center text-[11px] font-black leading-none tabular-nums" style={{ color: colors.number }}>{number ?? ""}</span>
  </span>;
}

function Marker({ row, colors }) {
  const goalkeeper = positionLetter(row.position) === "G" || row.placement?.line === 1;
  const palette = goalkeeper && colors.goalkeeper?.shirt ? colors.goalkeeper : colors.player;
  const body = <>
    <span className="relative">
      <Shirt colors={palette} number={row.number} />
      {row.rating != null && <b className={`absolute -right-3 -top-1 rounded px-1 text-[9px] leading-4 tabular-nums ${ratingBadge(row.rating)}`}>{Number(row.rating).toFixed(1)}</b>}
      {(row.goals > 0 || row.yellow > 0 || row.red > 0) && <span className="absolute -bottom-1 -right-3 flex gap-0.5 text-[9px] leading-none">{row.goals > 0 && <span title={`${row.goals} but(s)`}>⚽{row.goals > 1 ? row.goals : ""}</span>}{row.red > 0 ? <span title="Carton rouge" className="inline-block h-2.5 w-1.5 rounded-[1px] bg-red-500" /> : row.yellow > 0 && <span title="Carton jaune" className="inline-block h-2.5 w-1.5 rounded-[1px] bg-yellow-300" />}</span>}
    </span>
    <span className="mt-0.5 max-w-full truncate px-0.5 text-[10px] font-semibold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">{shortName(row.player_name)}</span>
  </>;
  const cls = "flex min-w-0 max-w-[5rem] flex-1 flex-col items-center justify-center transition hover:scale-105";
  return row.player_id ? <Link href={`/players/${row.player_id}`} className={cls} title={row.player_name}>{body}</Link> : <div className={cls} title={row.player_name || ""}>{body}</div>;
}

const withFallback = (colors, side) => ({
  player: colors?.player?.shirt ? colors.player : FALLBACK[side],
  goalkeeper: colors?.goalkeeper?.shirt ? colors.goalkeeper : null,
});

// Une moitié de terrain : lignes du but vers le centre ; `mirrored` pour
// l'équipe d'en face (gardien côté opposé, colonnes inversées).
function Half({ team, side, vertical }) {
  const colors = withFallback(team.colors, side);
  const mirrored = side === "away";
  const lines = mirrored ? [...team.lines].reverse() : team.lines;
  return <div className={`flex flex-1 ${vertical ? "flex-col" : "flex-row"} justify-around`}>
    {lines.map((line, index) => <div key={index} className={`flex ${vertical ? "flex-row" : "flex-col"} flex-1 items-center justify-around`}>
      {(mirrored ? [...line].reverse() : line).map((row) => <Marker key={row.id} row={row} colors={colors} />)}
    </div>)}
  </div>;
}

function Markings({ vertical }) {
  // Tracé du terrain (viewBox 100 × 64, ou 64 × 100 en vertical).
  return vertical
    ? <svg viewBox="0 0 64 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden><g fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4"><rect x="2" y="2" width="60" height="96" /><line x1="2" y1="50" x2="62" y2="50" /><circle cx="32" cy="50" r="8" /><rect x="16" y="2" width="32" height="14" /><rect x="24" y="2" width="16" height="5" /><rect x="16" y="84" width="32" height="14" /><rect x="24" y="93" width="16" height="5" /></g></svg>
    : <svg viewBox="0 0 100 64" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden><g fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4"><rect x="2" y="2" width="96" height="60" /><line x1="50" y1="2" x2="50" y2="62" /><circle cx="50" cy="32" r="8" /><rect x="2" y="16" width="14" height="32" /><rect x="2" y="24" width="5" height="16" /><rect x="84" y="16" width="14" height="32" /><rect x="93" y="24" width="5" height="16" /></g></svg>;
}

const PITCH = "relative overflow-hidden rounded-2xl border border-emerald-900/40";
const STRIPES = (angle) => ({ backgroundImage: `repeating-linear-gradient(${angle}deg, #2f8f3e 0, #2f8f3e 10%, #2b8439 10%, #2b8439 20%)` });

export default function LineupPitch({ home, away }) {
  if (!home.lines.length && !away.lines.length) return null;
  return <>
    <div className={`${PITCH} hidden aspect-[100/64] md:block`} style={STRIPES(90)}>
      <Markings />
      <div className="absolute inset-0 flex flex-row px-[2%] py-[3%]"><Half team={home} side="home" /><Half team={away} side="away" /></div>
    </div>
    <div className={`${PITCH} aspect-[64/100] md:hidden`} style={STRIPES(180)}>
      <Markings vertical />
      <div className="absolute inset-0 flex flex-col px-[2%] py-[3%]"><Half team={home} side="home" vertical /><Half team={away} side="away" vertical /></div>
    </div>
  </>;
}
