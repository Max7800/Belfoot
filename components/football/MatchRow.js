"use client";
import Link from "next/link";

// Ligne de match : logo collé au nom (28px, object-contain), score isolé au centre.
export default function MatchRow({ m, clubs, href, compact }) {
  const h = clubs[m.home_club_id] || {}, a = clubs[m.away_club_id] || {};
  const fin = m.status === "finished" && m.home_score != null;
  const res = (mine, other) => (!fin ? "" : mine > other ? "text-green-400" : mine < other ? "text-red-400/60" : "text-content");
  const pad = compact ? "gap-2 p-1.5 text-xs" : "gap-2 p-3 text-sm";
  const lg = compact ? "h-5 w-5" : "h-7 w-7";
  const sc = compact ? "px-2 py-0.5" : "px-3 py-1";
  const inner = (
    <div className={`flex items-center rounded-xl border border-line/10 bg-surface transition hover:border-accent/40 ${pad}`}>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className={`truncate text-right ${res(m.home_score, m.away_score)}`}>{h.name || "—"}</span>
        {h.logo_url && <img src={h.logo_url} className={`shrink-0 object-contain ${lg}`} alt="" />}
      </div>
      <div className={`shrink-0 rounded bg-surface2 text-center font-bold tabular-nums ${sc}`}>
        {m.home_score ?? "-"} : {m.away_score ?? "-"}
        {m.status === "live" && <span className="ml-1 text-[10px] font-bold text-red-500">●{m.minute ? m.minute + "'" : ""}</span>}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {a.logo_url && <img src={a.logo_url} className={`shrink-0 object-contain ${lg}`} alt="" />}
        <span className={`truncate ${res(m.away_score, m.home_score)}`}>{a.name || "—"}</span>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
