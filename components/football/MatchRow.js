"use client";
import Link from "next/link";
import { isMatchFinished, matchStatusMeta } from "@/lib/matchStatus";

// Ligne de match : logo collé au nom (28px, object-contain), score isolé au centre.
export default function MatchRow({ m, clubs, href, compact }) {
  const h = clubs[m.home_club_id] || {}, a = clubs[m.away_club_id] || {};
  const status = matchStatusMeta(m);
  const fin = isMatchFinished(m) && m.home_score != null;
  const res = (mine, other) => (!fin ? "text-content/80" : mine > other ? "font-semibold text-emerald-300" : mine < other ? "text-content/45" : "text-content/80");
  const pad = compact ? "gap-2 p-1.5 text-xs" : "gap-2 p-3 text-sm";
  const lg = compact ? "h-5 w-5" : "h-7 w-7";
  const sc = (compact ? "min-w-[48px] px-2 py-0.5" : "min-w-[58px] px-3 py-1") + " border border-white/10 bg-gradient-to-b from-white/[0.09] to-black/10 shadow-[0_5px_16px_-7px_rgba(45,120,255,0.7)]";
  const inner = (
    <div className={`group flex items-center rounded-xl border border-line/10 bg-gradient-to-r from-surface via-surface2/70 to-surface transition duration-200 hover:-translate-y-px hover:border-accent/35 hover:shadow-[0_10px_24px_-18px_rgba(50,125,255,0.9)] ${pad}`}>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className={`truncate text-right ${res(m.home_score, m.away_score)}`}>{h.name || "—"}</span>
        {h.logo_url && <img src={h.logo_url} className={`shrink-0 object-contain ${lg}`} alt="" />}
      </div>
      <div className={`shrink-0 rounded text-center font-bold tabular-nums ${status.live ? "border-red-500/30 bg-red-500/10 shadow-[0_5px_18px_-8px_rgba(239,68,68,.9)]" : "bg-surface2"} ${sc}`}>
        {m.home_score ?? "-"} : {m.away_score ?? "-"}
        {status.live && <span className="ml-1 text-[10px] font-bold text-red-400"><span className="animate-pulse">●</span>{status.compact !== "LIVE" ? status.compact : ""}</span>}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {a.logo_url && <img src={a.logo_url} className={`shrink-0 object-contain ${lg}`} alt="" />}
        <span className={`truncate ${res(m.away_score, m.home_score)}`}>{a.name || "—"}</span>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
