"use client";
import { supabase } from "./supabaseClient";
import { positionGroup } from "./positions";

// V1 : formation fixe 4-3-3. Chaque slot porte une catégorie (GK/DEF/MID/FWD)
// qui filtre les joueurs éligibles, et des coordonnées terrain (x,y en %) pour l'UI.
export const FORMATIONS = {
  "4-3-3": [
    { id: "GK", label: "Gardien", cat: "GK", x: 50, y: 91 },
    { id: "LB", label: "Latéral gauche", cat: "DEF", x: 15, y: 71 },
    { id: "CB1", label: "Défenseur central", cat: "DEF", x: 38, y: 76 },
    { id: "CB2", label: "Défenseur central", cat: "DEF", x: 62, y: 76 },
    { id: "RB", label: "Latéral droit", cat: "DEF", x: 85, y: 71 },
    { id: "CM1", label: "Milieu", cat: "MID", x: 28, y: 50 },
    { id: "CM2", label: "Milieu", cat: "MID", x: 50, y: 45 },
    { id: "CM3", label: "Milieu", cat: "MID", x: 72, y: 50 },
    { id: "LW", label: "Ailier gauche", cat: "FWD", x: 20, y: 23 },
    { id: "ST", label: "Buteur", cat: "FWD", x: 50, y: 17 },
    { id: "RW", label: "Ailier droit", cat: "FWD", x: 80, y: 23 },
  ],
};

export const CATEGORY_LABEL = { GK: "Gardiens", DEF: "Défenseurs", MID: "Milieux", FWD: "Attaquants" };

export function formationSlots(formation = "4-3-3") {
  return FORMATIONS[formation] || FORMATIONS["4-3-3"];
}

// Catégorie GK/DEF/MID/FWD depuis un poste brut (réutilise le helper commun).
export function categoryOf(position) {
  const key = positionGroup(position).key;
  return key === "OTHER" ? "MID" : key; // repli raisonnable pour un poste inconnu
}

// Génère (complète) la liste des éligibles d'une session depuis match_player_stats.
// ZÉRO appel API : lit uniquement des données déjà en base. Réservé admin (RLS).
// N'écrase pas les candidats déjà présents (ajouts/corrections manuels préservés).
export async function generateEligibles(session) {
  if (!session?.competition_id || !session?.season_id || session.matchday == null || session.matchday === "") {
    throw new Error("Compétition, saison et journée sont requises.");
  }
  const { data: matches, error: matchErr } = await supabase.from("matches")
    .select("id").eq("competition_id", session.competition_id)
    .eq("season_id", session.season_id).eq("matchday", session.matchday);
  if (matchErr) throw matchErr;
  const matchIds = (matches || []).map((m) => m.id);
  if (!matchIds.length) return { added: 0, found: 0, matches: 0 };

  const { data: stats, error: statErr } = await supabase.from("match_player_stats")
    .select("player_id,position,minutes").in("match_id", matchIds).gt("minutes", 0);
  if (statErr) throw statErr;

  const byPlayer = new Map();
  for (const row of stats || []) {
    if (row.player_id && !byPlayer.has(row.player_id)) byPlayer.set(row.player_id, categoryOf(row.position));
  }

  const { data: existing } = await supabase.from("votw_candidates").select("player_id").eq("session_id", session.id);
  const have = new Set((existing || []).map((c) => c.player_id));
  const rows = [...byPlayer.entries()]
    .filter(([playerId]) => !have.has(playerId))
    .map(([player_id, position]) => ({ session_id: session.id, player_id, position }));
  if (rows.length) {
    const { error: insErr } = await supabase.from("votw_candidates").insert(rows);
    if (insErr) throw insErr;
  }
  return { added: rows.length, found: byPlayer.size, matches: matchIds.length };
}
