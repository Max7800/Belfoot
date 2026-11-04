import React from "react";
import { recentCompetitionWinners } from "@/lib/competitionWinners";

function WinnerRow({ item }) {
  return <li className="flex items-center justify-between gap-4 border-t border-line/10 py-3 first:border-t-0">
    <div><span className="block text-xs font-bold text-muted">{item.season}</span><strong className="text-sm text-content">{item.winner}</strong></div>
    {item.source && <a href={item.source} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-muted underline hover:text-content">Source <span className="sr-only">pour {item.winner}, {item.season} (nouvel onglet)</span>↗</a>}
  </li>;
}

export default function CompetitionWinners({ history }) {
  const all = recentCompetitionWinners(history, Infinity);
  if (!all.length) return null;
  return <section className="rounded-2xl border border-amber-400/20 bg-surface/70 p-4 sm:p-5">
    <div className="mb-2"><p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Palmarès</p><h2 className="mt-1 text-lg font-black text-content">Derniers vainqueurs</h2><p className="mt-1 text-xs text-muted">Historique renseigné : certaines saisons peuvent manquer.</p></div>
    <ul>{all.slice(0, 5).map((item) => <WinnerRow key={item.season} item={item} />)}</ul>
    {all.length > 5 && <details className="border-t border-line/10 pt-3"><summary className="cursor-pointer text-xs font-bold text-muted hover:text-content">Voir les saisons précédentes ({all.length - 5})</summary><ul className="mt-2">{all.slice(5).map((item) => <WinnerRow key={item.season} item={item} />)}</ul></details>}
  </section>;
}
