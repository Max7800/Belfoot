"use client";
// Actualisation en direct des matchs d'une compétition (Supabase Realtime,
// table `matches` publiée par la migration 0026). Même mécanisme que la page
// Matchs, partagé par les pages qui affichent un classement : chaque mise à jour
// (score, but, fin de match, correction) remplace le match dans l'état React,
// et les classements, groupes compris, sont recalculés depuis ces données.
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { mergeMatchUpdate } from "@/lib/matchUpdates";

export function useCompetitionMatchUpdates(competitionId, seasonId, setMatches) {
  useEffect(() => {
    if (!competitionId) return undefined;
    const channel = supabase.channel(`matches-competition-${competitionId}-${seasonId || "all"}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `competition_id=eq.${competitionId}` }, (payload) => {
        setMatches((current) => mergeMatchUpdate(current, payload.new, seasonId));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [competitionId, seasonId, setMatches]);
}
