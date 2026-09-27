"use client";
import Link from "next/link";

function ratingTone(value) {
  if (value >= 8) return "bg-emerald-400 text-slate-950";
  if (value >= 7) return "bg-lime-400/90 text-slate-950";
  if (value >= 6) return "bg-amber-300 text-slate-950";
  return "bg-red-400 text-white";
}

function TeamPlayers({ club, rows }) {
  const ordered = [...rows].sort((a, b) => (Number(b.rating) || -1) - (Number(a.rating) || -1) || (Number(b.minutes) || 0) - (Number(a.minutes) || 0));
  return <section className="overflow-hidden rounded-2xl border border-line/10 bg-surface/60">
    <header className="flex items-center gap-2 border-b border-line/10 bg-white/[0.025] px-3 py-2.5">{club?.logo_url && <img src={club.logo_url} alt="" className="h-7 w-7 object-contain" />}<b className="truncate text-sm">{club?.name}</b></header>
    <div className="divide-y divide-line/10">{ordered.map((row) => {
      const body = <><span className="w-6 shrink-0 text-center text-[11px] font-bold text-muted">{row.number ?? "–"}</span><span className="min-w-0 flex-1"><b className="block truncate text-xs">{row.player_name || "Joueur"}</b><span className="text-[10px] text-muted">{row.position || "–"} · {row.minutes ?? 0} min</span></span><span className="hidden gap-2 text-[10px] text-muted sm:flex">{!!row.goals && <b>⚽ {row.goals}</b>}{!!row.assists && <b>A {row.assists}</b>}{!!row.saves && <b>🧤 {row.saves}</b>}</span><b className={`w-9 rounded-md px-1 py-1 text-center text-xs tabular-nums ${row.rating != null ? ratingTone(Number(row.rating)) : "bg-white/[0.06] text-muted"}`}>{row.rating != null ? Number(row.rating).toFixed(1) : "–"}</b></>;
      const cls = "flex items-center gap-2 px-3 py-2 transition hover:bg-white/[0.025]";
      return row.player_id ? <Link href={`/players/${row.player_id}`} key={row.id} className={cls}>{body}</Link> : <div key={row.id} className={cls}>{body}</div>;
    })}{ordered.length === 0 && <p className="p-4 text-sm text-muted">Aucune performance importée.</p>}</div>
  </section>;
}

export default function MatchPlayerRatings({ homeClub, awayClub, rows = [] }) {
  return <div className="grid gap-4 md:grid-cols-2"><TeamPlayers club={homeClub} rows={rows.filter((row) => row.club_id === homeClub?.id)} /><TeamPlayers club={awayClub} rows={rows.filter((row) => row.club_id === awayClub?.id)} /></div>;
}
