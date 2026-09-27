"use client";

const GROUPS = [
  { label: "Vue d’ensemble", rows: [["possession", "Possession", "%"], ["shots_total", "Tirs"], ["shots_on_goal", "Tirs cadrés"], ["expected_goals", "Buts attendus", "xg"]] },
  { label: "Avec le ballon", rows: [["passes_total", "Passes"], ["passes_accurate", "Passes réussies"], ["pass_accuracy", "Précision des passes", "%"], ["corners", "Corners"]] },
  { label: "Sans le ballon", rows: [["fouls", "Fautes"], ["offsides", "Hors-jeu"], ["goalkeeper_saves", "Arrêts"], ["yellow", "Cartons jaunes"], ["red", "Cartons rouges"]] },
];

function display(value, unit) {
  if (value == null) return "–";
  if (unit === "xg") return Number(value).toFixed(2);
  return `${Number(value).toLocaleString("fr-BE", { maximumFractionDigits: 1 })}${unit === "%" ? "%" : ""}`;
}

function StatRow({ label, field, unit, home, away }) {
  const homeValue = home?.[field] == null ? null : Number(home[field]);
  const awayValue = away?.[field] == null ? null : Number(away[field]);
  const total = Math.max(0, (homeValue || 0) + (awayValue || 0));
  const homeWidth = field === "possession" || field === "pass_accuracy" ? (homeValue || 0) : total ? ((homeValue || 0) / total) * 100 : 0;
  const awayWidth = field === "possession" || field === "pass_accuracy" ? (awayValue || 0) : total ? ((awayValue || 0) / total) * 100 : 0;
  return (
    <div className="py-2.5">
      <div className="mb-1.5 grid grid-cols-[3.25rem_1fr_3.25rem] items-center gap-2 text-xs">
        <b className={homeValue != null && homeValue > awayValue ? "text-white" : "text-muted"}>{display(homeValue, unit)}</b>
        <span className="text-center text-[11px] font-semibold text-muted">{label}</span>
        <b className={`text-right ${awayValue != null && awayValue > homeValue ? "text-white" : "text-muted"}`}>{display(awayValue, unit)}</b>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-white/[0.05]"><span className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, homeWidth)}%` }} /></div>
        <div className="h-1.5 overflow-hidden rounded-r-full bg-white/[0.05]"><span className="block h-full rounded-full bg-sky-400" style={{ width: `${Math.min(100, awayWidth)}%` }} /></div>
      </div>
    </div>
  );
}

export default function MatchTeamStats({ homeClub, awayClub, rows = [], compact = false }) {
  const home = rows.find((row) => row.club_id === homeClub?.id);
  const away = rows.find((row) => row.club_id === awayClub?.id);
  if (!home && !away) return <div className="rounded-2xl border border-dashed border-line/15 p-5 text-center text-sm text-muted">Les statistiques collectives apparaîtront après la synchronisation du match.</div>;
  const groups = compact ? [{ label: null, rows: GROUPS[0].rows.slice(0, 4) }] : GROUPS;
  return (
    <div className="overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/40">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line/10 bg-white/[0.025] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">{homeClub?.logo_url && <img src={homeClub.logo_url} alt="" className="h-7 w-7 object-contain" />}<b className="truncate text-xs">{homeClub?.name}</b></div>
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">Comparatif</span>
        <div className="flex min-w-0 items-center justify-end gap-2"><b className="truncate text-right text-xs">{awayClub?.name}</b>{awayClub?.logo_url && <img src={awayClub.logo_url} alt="" className="h-7 w-7 object-contain" />}</div>
      </div>
      <div className="px-4 py-2 sm:px-6">
        {groups.map((group, index) => <section key={group.label || index} className={index ? "border-t border-line/10 pt-2" : ""}>
          {group.label && <h3 className="pt-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted">{group.label}</h3>}
          {group.rows.map(([field, label, unit]) => <StatRow key={field} field={field} label={label} unit={unit} home={home} away={away} />)}
        </section>)}
      </div>
    </div>
  );
}
