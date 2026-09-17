"use client";
import Link from "next/link";
import { useState } from "react";

function gridOrder(value) {
  const [row, column] = String(value || "99:99").split(":").map(Number);
  return (Number.isFinite(row) ? row : 99) * 10 + (Number.isFinite(column) ? column : 99);
}

function PlayerRow({ row, muted = false }) {
  const name = row.player_name || "Joueur non identifié";
  const content = (
    <>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${muted ? "bg-white/[0.04] text-muted" : "bg-accent/15 text-accent"}`}>{row.number ?? "–"}</span>
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{name}{row.captain ? " ©" : ""}</span><span className="block text-[10px] uppercase tracking-wider text-muted">{row.position || (muted ? "Remplaçant" : "Titulaire")}{row.minutes != null ? ` · ${row.minutes} min` : ""}</span></span>
      <span className="flex shrink-0 items-center gap-1 text-[11px]">
        {!!row.goals && <b title="Buts">⚽ {row.goals}</b>}
        {!!row.assists && <b title="Passes décisives" className="text-sky-300">A {row.assists}</b>}
        {!!row.saves && <b title="Arrêts" className="text-cyan-300">🧤 {row.saves}</b>}
        {!!row.yellow && <span title="Carton jaune">🟨</span>}
        {!!row.red && <span title="Carton rouge">🟥</span>}
        {row.rating != null && <b className="ml-1 rounded-md bg-white/[0.08] px-1.5 py-0.5 tabular-nums text-content">{Number(row.rating).toFixed(1)}</b>}
      </span>
    </>
  );
  const cls = "flex min-w-0 items-center gap-2 border-b border-line/10 px-2 py-2 text-xs last:border-b-0 hover:bg-white/[0.025]";
  return row.player_id ? <Link href={`/players/${row.player_id}`} className={cls}>{content}</Link> : <div className={cls}>{content}</div>;
}

function TeamCard({ club, lineup, rows, starterLabel, benchLabel, labels }) {
  const starters = rows.filter((row) => row.starter).sort((a, b) => gridOrder(a.grid) - gridOrder(b.grid) || (a.number ?? 99) - (b.number ?? 99));
  const bench = rows.filter((row) => !row.starter).sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
  return (
    <section className="overflow-hidden rounded-2xl border border-line/10 bg-gradient-to-b from-surface to-bg/50">
      <header className="flex items-center gap-3 border-b border-line/10 bg-white/[0.025] p-3">
        {club?.logo_url && <img src={club.logo_url} className="h-9 w-9 object-contain" alt="" />}
        <div className="min-w-0 flex-1"><div className="truncate font-black">{club?.name || "Équipe"}</div><div className="text-xs font-semibold text-accent">{lineup?.formation || labels?.formationEmpty || "Formation non renseignée"}</div></div>
      </header>
      <div className="p-2">
        <div className="px-2 pb-1 pt-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">{starterLabel}</div>
        <div>{starters.map((row) => <PlayerRow key={row.id} row={row} />)}{starters.length === 0 && <p className="px-2 py-3 text-xs text-muted">{labels?.startersEmpty || "Aucun titulaire importé."}</p>}</div>
        {bench.length > 0 && <><div className="mt-2 border-t border-line/10 px-2 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.18em] text-muted">{benchLabel}</div><div>{bench.map((row) => <PlayerRow key={row.id} row={row} muted />)}</div></>}
      </div>
    </section>
  );
}

export default function MatchLineups({ homeClub, awayClub, lineups, rows, labels = {} }) {
  const [mobileTeam, setMobileTeam] = useState("home");
  const homeRows = rows.filter((row) => row.club_id === homeClub?.id);
  const awayRows = rows.filter((row) => row.club_id === awayClub?.id);
  const lineupFor = (club) => lineups.find((row) => row.club_id === club?.id);
  const cardProps = (club, teamRows) => ({ club, rows: teamRows, lineup: lineupFor(club), starterLabel: labels.starters || "Titulaires", benchLabel: labels.bench || "Remplaçants", labels });
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 rounded-xl border border-line/10 bg-surface p-1 md:hidden">
        <button onClick={() => setMobileTeam("home")} className={`rounded-lg px-2 py-2 text-xs font-bold ${mobileTeam === "home" ? "bg-accent text-white" : "text-muted"}`}>{homeClub?.name || labels.home || "Domicile"}</button>
        <button onClick={() => setMobileTeam("away")} className={`rounded-lg px-2 py-2 text-xs font-bold ${mobileTeam === "away" ? "bg-accent text-white" : "text-muted"}`}>{awayClub?.name || labels.away || "Extérieur"}</button>
      </div>
      <div className="hidden gap-4 md:grid md:grid-cols-2"><TeamCard {...cardProps(homeClub, homeRows)} /><TeamCard {...cardProps(awayClub, awayRows)} /></div>
      <div className="md:hidden">{mobileTeam === "home" ? <TeamCard {...cardProps(homeClub, homeRows)} /> : <TeamCard {...cardProps(awayClub, awayRows)} />}</div>
    </div>
  );
}
