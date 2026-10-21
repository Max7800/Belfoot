// Rafraîchissement automatique des compétitions (cron competition-refresh) :
// règles partagées, sans dépendance au client Supabase (testables).
//
// - Toute compétition VISIBLE du site avec un fournisseur est concernée,
//   compétitions internationales comprises (qualifications U21, Ligue des nations…).
// - Chaque compétition est rafraîchie sur SA saison publique (active, sinon la
//   plus récente des saisons publiées : même règle que l'affichage public),
//   jamais sur l'année du calendrier : une campagne U21 « 2027-2028 » se joue en 2025-2026.
// - Une compétition sans saison publiée n'est pas rafraîchie (rien d'affiché).
// - Le passage « statistiques joueurs » (effectifs club par club) reste réservé
//   aux compétitions de clubs : pour des sélections il importerait des effectifs
//   nationaux, coûteux et sans statistiques de club.
import { sortPublicSeasons } from "./publicSeasons";

// Budget de temps d'un passage du cron : la fonction est coupée à maxDuration
// (60 s) et une synchro complète prend 10 à 20 s. Aucune nouvelle synchro n'est
// lancée au-delà, et l'état est enregistré après CHAQUE réussite : une coupure
// ne fait plus refaire (ni repayer) les mêmes compétitions au passage suivant.
export const REFRESH_TIME_BUDGET_MS = 35000;

export function refreshSeasonFor(seasons = []) {
  return sortPublicSeasons(seasons)[0] || null;
}

export function refreshTargets(competitions = [], seasons = []) {
  const byCompetition = new Map();
  for (const season of seasons) {
    if (!byCompetition.has(season.competition_id)) byCompetition.set(season.competition_id, []);
    byCompetition.get(season.competition_id).push(season);
  }
  const targets = [];
  const skipped = [];
  for (const competition of competitions) {
    if (competition.public_visible === false || !competition.provider) continue;
    const season = refreshSeasonFor(byCompetition.get(competition.id) || []);
    if (!season) { skipped.push({ competition: competition.name, reason: "aucune saison publiée" }); continue; }
    targets.push({ competition, season, statsEligible: competition.competition_scope !== "international" });
  }
  return { targets, skipped };
}
