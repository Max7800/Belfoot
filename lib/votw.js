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
  "4-4-2": [
    { id: "GK", label: "Gardien", cat: "GK", x: 50, y: 91 },
    { id: "LB", label: "Latéral gauche", cat: "DEF", x: 15, y: 72 },
    { id: "CB1", label: "Défenseur central", cat: "DEF", x: 38, y: 77 },
    { id: "CB2", label: "Défenseur central", cat: "DEF", x: 62, y: 77 },
    { id: "RB", label: "Latéral droit", cat: "DEF", x: 85, y: 72 },
    { id: "LM", label: "Milieu gauche", cat: "MID", x: 16, y: 47 },
    { id: "CM1", label: "Milieu central", cat: "MID", x: 39, y: 51 },
    { id: "CM2", label: "Milieu central", cat: "MID", x: 61, y: 51 },
    { id: "RM", label: "Milieu droit", cat: "MID", x: 84, y: 47 },
    { id: "ST1", label: "Attaquant", cat: "FWD", x: 35, y: 20 },
    { id: "ST2", label: "Attaquant", cat: "FWD", x: 65, y: 20 },
  ],
  "3-4-3": [
    { id: "GK", label: "Gardien", cat: "GK", x: 50, y: 91 },
    { id: "CB1", label: "Défenseur central", cat: "DEF", x: 25, y: 73 },
    { id: "CB2", label: "Défenseur central", cat: "DEF", x: 50, y: 78 },
    { id: "CB3", label: "Défenseur central", cat: "DEF", x: 75, y: 73 },
    { id: "LM", label: "Piston gauche", cat: "MID", x: 14, y: 47 },
    { id: "CM1", label: "Milieu central", cat: "MID", x: 39, y: 52 },
    { id: "CM2", label: "Milieu central", cat: "MID", x: 61, y: 52 },
    { id: "RM", label: "Piston droit", cat: "MID", x: 86, y: 47 },
    { id: "LW", label: "Ailier gauche", cat: "FWD", x: 20, y: 22 },
    { id: "ST", label: "Buteur", cat: "FWD", x: 50, y: 16 },
    { id: "RW", label: "Ailier droit", cat: "FWD", x: 80, y: 22 },
  ],
  "3-5-2": [
    { id: "GK", label: "Gardien", cat: "GK", x: 50, y: 91 },
    { id: "CB1", label: "Défenseur central", cat: "DEF", x: 25, y: 74 },
    { id: "CB2", label: "Défenseur central", cat: "DEF", x: 50, y: 79 },
    { id: "CB3", label: "Défenseur central", cat: "DEF", x: 75, y: 74 },
    { id: "LM", label: "Piston gauche", cat: "MID", x: 13, y: 48 },
    { id: "CM1", label: "Milieu central", cat: "MID", x: 33, y: 50 },
    { id: "CM2", label: "Milieu central", cat: "MID", x: 50, y: 42 },
    { id: "CM3", label: "Milieu central", cat: "MID", x: 67, y: 50 },
    { id: "RM", label: "Piston droit", cat: "MID", x: 87, y: 48 },
    { id: "ST1", label: "Attaquant", cat: "FWD", x: 35, y: 19 },
    { id: "ST2", label: "Attaquant", cat: "FWD", x: 65, y: 19 },
  ],
};

export const FORMATION_OPTIONS = Object.keys(FORMATIONS);

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
  if (session?.kind === "pre_match") {
    if (!session.match_id || !session.national_team_id) throw new Error("Match et sélection sont requis pour un onze d’avant-match.");
    const byPlayer = new Map();
    const { data: exact, error: exactError } = await supabase.from("national_match_callups")
      .select("player_id,position,status").eq("match_id", session.match_id).eq("national_team_id", session.national_team_id)
      .neq("status", "unavailable");
    if (exactError) throw exactError;
    for (const row of exact || []) if (row.player_id) byPlayer.set(row.player_id, categoryOf(row.position));
    let source = "match-callups";
    if (byPlayer.size === 0) {
      const { data: current, error: currentError } = await supabase.from("national_team_callups")
        .select("player_id,position").eq("national_team_id", session.national_team_id).eq("active", true);
      if (currentError) throw currentError;
      for (const row of current || []) if (row.player_id) byPlayer.set(row.player_id, categoryOf(row.position));
      source = "current-callups";
    }
    const { data: existing } = await supabase.from("votw_candidates").select("player_id").eq("session_id", session.id);
    const have = new Set((existing || []).map((row) => row.player_id));
    const rows = [...byPlayer.entries()].filter(([playerId]) => !have.has(playerId)).map(([player_id, position]) => ({ session_id: session.id, player_id, position }));
    if (rows.length) {
      const { error } = await supabase.from("votw_candidates").insert(rows);
      if (error) throw error;
    }
    return { added: rows.length, found: byPlayer.size, matches: 1, source };
  }
  if (!session?.competition_id || !session?.season_id || session.matchday == null || session.matchday === "") {
    throw new Error("Compétition, saison et journée sont requises.");
  }
  const { data: matches, error: matchErr } = await supabase.from("matches")
    .select("id,home_club_id,away_club_id").eq("competition_id", session.competition_id)
    .eq("season_id", session.season_id).eq("matchday", session.matchday);
  if (matchErr) throw matchErr;
  const matchIds = (matches || []).map((m) => m.id);
  if (!matchIds.length) {
    // Filet : des matchs existent-ils pour cette compétition + journée mais SANS
    // saison rattachée (season_id NULL) ? Si oui, on le signale au lieu d'un « 0 »
    // muet. Cause racine à corriger dans l'import (voir prépa 2026 du handoff).
    const { count } = await supabase.from("matches").select("id", { count: "exact", head: true })
      .eq("competition_id", session.competition_id).eq("matchday", session.matchday).is("season_id", null);
    return { added: 0, found: 0, matches: 0, source: (count || 0) > 0 ? "no-season" : "none" };
  }

  // 1) Source principale : joueurs ayant réellement joué (match_player_stats).
  const { data: stats, error: statErr } = await supabase.from("match_player_stats")
    .select("player_id,position,minutes").in("match_id", matchIds).gt("minutes", 0);
  if (statErr) throw statErr;
  const byPlayer = new Map();
  for (const row of stats || []) {
    if (row.player_id && !byPlayer.has(row.player_id)) byPlayer.set(row.player_id, categoryOf(row.position));
  }
  let source = "stats";

  // 2) Repli SANS appel API (dev/démo) : si aucune stat de match, prendre les
  // joueurs des effectifs des clubs qui ont joué cette journée. Le vrai
  // remplissage par match (compos) viendra du job lineups au mois Pro.
  if (byPlayer.size === 0) {
    const clubIds = [...new Set((matches || []).flatMap((m) => [m.home_club_id, m.away_club_id]).filter(Boolean))];
    if (clubIds.length) {
      const { data: players } = await supabase.from("players").select("id,position").in("club_id", clubIds);
      for (const p of players || []) {
        if (p.id && !byPlayer.has(p.id)) byPlayer.set(p.id, categoryOf(p.position));
      }
      source = "squad";
    }
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
  return { added: rows.length, found: byPlayer.size, matches: matchIds.length, source };
}

// Calcule et fige le « Onze des lecteurs » d'une session à partir des votes.
// Par slot : le joueur le plus voté ; égalité départagée par note puis minutes
// (si dispo). Gèle un snapshot joueur pour que l'archive ne bouge jamais.
// Réservé admin (RLS). Rejoue proprement (remplace le résultat existant).
export async function computeResult(session) {
  const { data: votes } = await supabase.from("votw_votes").select("position,player_id").eq("session_id", session.id);
  const bySlot = {};
  for (const v of votes || []) {
    if (!bySlot[v.position]) bySlot[v.position] = new Map();
    bySlot[v.position].set(v.player_id, (bySlot[v.position].get(v.player_id) || 0) + 1);
  }

  // Stats pour départager (note puis minutes), si présentes en base.
  const stat = {};
  if (session.competition_id && session.season_id && session.matchday != null) {
    const { data: matches } = await supabase.from("matches").select("id").eq("competition_id", session.competition_id).eq("season_id", session.season_id).eq("matchday", session.matchday);
    const matchIds = (matches || []).map((m) => m.id);
    if (matchIds.length) {
      const { data: rows } = await supabase.from("match_player_stats").select("player_id,minutes,rating").in("match_id", matchIds);
      for (const r of rows || []) {
        const cur = stat[r.player_id] || { minutes: 0, rating: 0 };
        cur.minutes = Math.max(cur.minutes, r.minutes || 0);
        if (r.rating != null) cur.rating = Math.max(cur.rating, Number(r.rating));
        stat[r.player_id] = cur;
      }
    }
  }

  const winners = [];
  for (const slot of formationSlots(session.formation)) {
    const counts = bySlot[slot.id];
    if (!counts || counts.size === 0) continue;
    const ranked = [...counts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const sa = stat[a[0]] || {}, sb = stat[b[0]] || {};
      if ((sb.rating || 0) !== (sa.rating || 0)) return (sb.rating || 0) - (sa.rating || 0);
      return (sb.minutes || 0) - (sa.minutes || 0);
    });
    winners.push({ slot: slot.id, player_id: ranked[0][0], votes: ranked[0][1] });
  }

  const ids = winners.map((w) => w.player_id);
  const { data: players } = ids.length ? await supabase.from("players").select("id,name,photo_url,club_id").in("id", ids) : { data: [] };
  const clubIds = [...new Set((players || []).map((p) => p.club_id).filter(Boolean))];
  const { data: clubs } = clubIds.length ? await supabase.from("clubs").select("id,name,logo_url").in("id", clubIds) : { data: [] };
  const clubById = Object.fromEntries((clubs || []).map((c) => [c.id, c]));
  const pById = Object.fromEntries((players || []).map((p) => [p.id, p]));

  await supabase.from("votw_results").delete().eq("session_id", session.id);
  const rows = winners.map((w) => {
    const p = pById[w.player_id] || {};
    const club = clubById[p.club_id];
    return { session_id: session.id, position: w.slot, player_id: w.player_id, votes: w.votes, player_snapshot: { name: p.name, photo: p.photo_url, club: club?.name, clubLogo: club?.logo_url } };
  });
  if (rows.length) {
    const { error } = await supabase.from("votw_results").insert(rows);
    if (error) throw error;
  }
  return { slots: rows.length, votes: (votes || []).length };
}
