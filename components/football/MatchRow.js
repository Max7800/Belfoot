"use client";
import Link from "next/link";

// Ligne de match : logo collé au nom (28px, object-contain), score isolé au centre.
export default function MatchRow({ m, clubs, href }) {
  const h = clubs[m.home_club_id] || {}, a = clubs[m.away_club_id] || {};
  const inner = (
    <div className="flex items-center gap-2 rounded-xl border border-line/10 bg-surface p-3 text-sm transition hover:border-accent/40">
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="truncate text-right">{h.name || "—"}</span>
        {h.logo_url && <img src={h.logo_url} className="h-7 w-7 shrink-0 object-contain" alt="" />}
      </div>
      <div className="shrink-0 rounded bg-surface2 px-3 py-1 text-center font-bold tabular-nums">
        {m.home_score ?? "-"} : {m.away_score ?? "-"}
        {m.status === "live" && <span className="ml-1 text-[10px] font-bold text-red-500">●{m.minute ? m.minute + "'" : ""}</span>}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {a.logo_url && <img src={a.logo_url} className="h-7 w-7 shrink-0 object-contain" alt="" />}
        <span className="truncate">{a.name || "—"}</span>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}
