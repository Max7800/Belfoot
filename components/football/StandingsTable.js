"use client";
import Link from "next/link";

export default function StandingsTable({ standings, clubs, zones = [], L = (k, d) => d }) {
  const zoneFor = (pos) => (zones || []).find((z) => pos >= (z.from || 0) && pos <= (z.to || 0));
  const name = (id) => clubs[id]?.name || "—";
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-line/10">
        <table className="w-full text-sm">
          <thead className="bg-surface2 text-muted"><tr><th className="p-2 text-left">{L("std.club", "Club")}</th><th>{L("std.played", "J")}</th><th>{L("std.won", "G")}</th><th>{L("std.drawn", "N")}</th><th>{L("std.lost", "P")}</th><th>{L("std.gd", "Diff")}</th><th>{L("std.pts", "Pts")}</th></tr></thead>
          <tbody>
            {standings.map((r, i) => {
              const z = zoneFor(i + 1);
              return (
                <tr key={r.club} className="border-t border-line/10 text-center">
                  <td className="p-2 text-left" style={z ? { boxShadow: `inset 3px 0 0 ${z.color}` } : null}>
                    <span className="ml-1 inline-flex items-center gap-2">{i + 1}. <Link href={`/clubs/${r.club}`} className="inline-flex items-center gap-2 hover:text-accent">{clubs[r.club]?.logo_url && <img src={clubs[r.club].logo_url} className="h-5 w-5 object-contain" alt="" />}{name(r.club)}</Link></span>
                  </td>
                  <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.gd}</td><td className="font-bold">{r.pts}</td>
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
