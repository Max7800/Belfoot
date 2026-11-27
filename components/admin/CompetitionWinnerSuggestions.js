"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { loadCupWinnerSuggestions } from "@/lib/competitionWinnerSuggestions";

// Lecture locale à la demande : aucune requête API-Football et aucune écriture.
export default function CompetitionWinnerSuggestions({ competition, history, onAdd, onAddMany }) {
  const [state, setState] = useState({ status: "idle", items: [], error: "" });
  async function inspect() {
    setState({ status: "loading", items: [], error: "" });
    try {
      const items = await loadCupWinnerSuggestions(supabase, competition);
      setState({ status: "ready", items, error: "" });
    } catch (error) { setState({ status: "error", items: [], error: error.message || String(error) }); }
  }
  if (!competition?.id || !["cup", "league"].includes(competition.competition_type)) return null;
  const existingHistory = Array.isArray(history) ? history : [];
  return <section className="sm:col-span-2 rounded-xl border border-line/10 bg-surface/40 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Rechercher des vainqueurs possibles</strong><button type="button" disabled={state.status === "loading"} onClick={inspect} className="rounded border border-line/20 px-3 py-1.5 text-xs font-bold disabled:opacity-50">{state.status === "loading" ? "Analyse…" : "Analyser les matchs enregistrés"}</button></div>
    <p className="mt-2 text-xs text-muted">Jusqu’à 12 saisons, sans appel API-Football. Propositions à vérifier : un import terminé ne garantit pas la couverture complète du fournisseur. Un championnat n’est proposé que si le classement indique explicitement son champion. Aucun résultat n’est enregistré automatiquement.</p>
    {state.status === "error" && <p role="alert" className="mt-2 text-xs text-red-400">Analyse impossible : {state.error}</p>}
    {state.status === "ready" && !state.items.length && <p className="mt-2 text-xs text-muted">Aucune saison enregistrée.</p>}
    {state.items.some((item) => item.status === "candidate" && !existingHistory.some((row) => String(row?.season || "").trim() === item.season)) && <button type="button" onClick={() => onAddMany(state.items.filter((item) => item.status === "candidate" && !existingHistory.some((row) => String(row?.season || "").trim() === item.season)).map((item) => ({ season: item.season, winner: item.winner, club_id: item.clubId, source: "" })))} className="mt-3 rounded border border-amber-400/30 px-3 py-1.5 text-xs font-bold text-amber-300">Ajouter toutes les propositions à vérifier</button>}
    {state.items.map((item) => { const existing = Array.isArray(history) && history.some((row) => String(row?.season || "").trim() === item.season); return <div key={item.season} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line/10 pt-2 text-xs"><span><b>{item.season}</b> · {item.status === "candidate" ? item.winner : "À vérifier : données insuffisantes ou résultat ambigu"}</span>{item.status === "candidate" && <span className="flex gap-2">{(item.matchIds || (item.matchId ? [item.matchId] : [])).map((id, index) => <a key={id} href={`/matchs/${id}`} target="_blank" rel="noopener noreferrer" className="underline">{item.matchIds ? `Manche ${index + 1}` : "Voir la finale"} ↗</a>)}<button type="button" disabled={existing} onClick={() => onAdd({ season: item.season, winner: item.winner, club_id: item.clubId, source: "" })} className="font-bold text-amber-300 disabled:text-muted">{existing ? "Déjà renseigné" : "Ajouter à vérifier"}</button></span>}</div>; })}
  </section>;
}
