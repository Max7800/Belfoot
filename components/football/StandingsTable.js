"use client";
import Link from "next/link";

export default function StandingsTable({ standings, clubs, zones = [], L = (k, d) => d }) {
  const zoneFor = (pos) => (zones || []).find((z) => {
    const from = Number(z.from); const to = Number(z.to);
    return Number.isFinite(from) && Number.isFinite(to) && pos >= from && pos <= to;
  });
  const name = (id) => clubs[id]?.name || "—";
  return (
    <div>
      <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/30 shadow-[0_18px_45px_-30px_rgba(0,0,0,0.9)]">
        <table className="w-full text-sm">
          <thead className="bg-surface2/80 text-[11px] uppercase tracking-wider text-muted"><tr><th className="min-w-[190px] p-3 text-left">{L("std.club", "Club")}</th><th className="px-2">{L("std.played", "J")}</th><th className="px-2">{L("std.won", "G")}</th><th className="px-2">{L("std.drawn", "N")}</th><th className="px-2">{L("std.lost", "P")}</th><th className="px-2">{L("std.gd", "Diff")}</th><th className="px-3">{L("std.pts", "Pts")}</th></tr></thead>
          <tbody>
            {standings.map((r, i) => {
              const z = zoneFor(i + 1);
              return (
                <tr key={r.club} className="border-t border-line/10 text-center transition-colors hover:bg-white/[0.035]">
                  <td className="p-2.5 text-left">
                    <span className="inline-flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-black" style={z ? { borderColor: `${z.color}80`, background: `${z.color}22`, color: z.color } : { borderColor: "rgba(148,163,184,0.5)", background: "rgba(148,163,184,0.2)", color: "rgb(226,232,240)" }}>{i + 1}</span>
                      <Link href={`/clubs/${r.club}`} className="inline-flex items-center gap-2 font-semibold hover:text-accent">{clubs[r.club]?.logo_url && <img src={clubs[r.club].logo_url} className="h-6 w-6 object-contain" alt="" />}{name(r.club)}</Link>
                    </span>
                  </td>
                  <td className="px-2 text-muted">{r.played}</td><td className="px-2">{r.won}</td><td className="px-2">{r.drawn}</td><td className="px-2">{r.lost}</td><td className="px-2 font-medium">{r.gd > 0 ? `+${r.gd}` : r.gd}</td><td className="px-3"><span className="inline-flex min-w-9 justify-center rounded-lg bg-white/[0.06] px-2 py-1 font-black">{r.pts}</span></td>
                </tr>
              );
            })}
            {standings.length === 0 && <tr><td colSpan="7" className="p-4 text-center text-muted">{L("std.empty", "Classement vide.")}</td></tr>}
          </tbody>
        </table>
      </div>
      {zones?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
          {zones.map((z, i) => <span key={i} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: z.color }} />{z.label}</span>)}
        </div>
      )}
    </div>
  );
}
