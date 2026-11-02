"use client";
import { matchComparison } from "@/lib/matchComparison";

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
  const { home: homeValue, away: awayValue, homeWidth, awayWidth, leader } = matchComparison(field, home?.[field], away?.[field]);
  return (
    <div className="py-2 sm:py-2.5">
      <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 text-sm tabular-nums">
        <b className={leader === "home" ? "font-black text-content" : "font-semibold text-muted"}>{display(homeValue, unit)}</b>
        <span className="text-center text-xs font-bold leading-snug text-content sm:text-sm">{label}</span>
        <b className={`text-right ${leader === "away" ? "font-black text-content" : "font-semibold text-muted"}`}>{display(awayValue, unit)}</b>
      </div>
      <div aria-hidden="true" className="mx-auto mt-1.5 grid w-full max-w-sm grid-cols-2 gap-0.5">
        <div className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-line/10"><span className="h-full rounded-l-full bg-cyan-500" style={{ width: `${Math.min(100, homeWidth)}%` }} /></div>
        <div className="h-1.5 overflow-hidden rounded-r-full bg-line/10"><span className="block h-full rounded-r-full bg-rose-500" style={{ width: `${Math.min(100, awayWidth)}%` }} /></div>
      </div>
    </div>
  );
}

export default function MatchTeamStats({ homeClub, awayClub, rows = [], compact = false, empty = "Statistiques collectives pas encore disponibles." }) {
  const home = rows.find((row) => row.club_id === homeClub?.id);
  const away = rows.find((row) => row.club_id === awayClub?.id);
  if (!home && !away) return <div className="rounded-2xl border border-dashed border-line/15 p-5 text-center text-sm text-muted">{empty}</div>;
  const groups = compact ? [{ label: null, rows: GROUPS[0].rows.slice(0, 4) }] : GROUPS;
  return (
    <div className="overflow-hidden rounded-2xl border border-line/10 bg-surface/60">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line/10 bg-bg/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">{homeClub?.logo_url && <img src={homeClub.logo_url} alt="" className="h-7 w-7 object-contain" />}<div className="min-w-0"><b className="block truncate text-xs sm:text-sm">{homeClub?.name || "Domicile"}</b><span className="text-[10px] text-muted">Domicile</span></div></div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Stats</span>
        <div className="flex min-w-0 items-center justify-end gap-2"><div className="min-w-0 text-right"><b className="block truncate text-xs sm:text-sm">{awayClub?.name || "Extérieur"}</b><span className="text-[10px] text-muted">Extérieur</span></div>{awayClub?.logo_url && <img src={awayClub.logo_url} alt="" className="h-7 w-7 object-contain" />}</div>
      </div>
      <div className="px-4 py-1 sm:px-6">
        {groups.map((group, index) => <section key={group.label || index} className={index ? "border-t border-line/10 pt-2" : ""}>
          {group.label && <h3 className="pb-0.5 pt-3 text-xs font-bold text-muted">{group.label}</h3>}
          {group.rows.map(([field, label, unit]) => <StatRow key={field} field={field} label={label} unit={unit} home={home} away={away} />)}
        </section>)}
      </div>
    </div>
  );
}
