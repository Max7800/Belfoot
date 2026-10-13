// Carte « Prochaine journée » : règle unique, harmonisée avec isMatchOver.
//
// Pendant une journée en cours (au moins un match commencé ou joué), la carte
// montre la journée COMPLÈTE suivante ; le reliquat de la journée en cours
// reste visible dans la carte des résultats. Un match reporté, annulé, un
// direct bloqué ou un match programmé jamais mis à jour ne retient jamais la
// carte sur une ancienne journée.
import { isMatchLive, isMatchOver } from "./matchStatus";

// Même délai que isMatchOver : au-delà de 3 h après le coup d'envoi, un match
// non finalisé n'est plus « à venir » (direct bloqué, statut jamais mis à jour).
export const STALE_AFTER_MS = 10800000;

const VOID_SHORT = new Set(["CANC", "ABD", "AWD", "WO"]);
// SUSP / INT sont rangés en « postponed » par la synchro mais sont des matchs
// commencés (interrompus, reconnus comme direct par isMatchLive) : ils ne sont
// pas traités comme des reports.
const INTERRUPTED_SHORT = new Set(["SUSP", "INT"]);

const shortOf = (match) => String(match?.ext?.status_short || match?.ext?.fixture?.status?.short || "").toUpperCase();
const kickoffOf = (match) => {
  const time = match?.kickoff ? Date.parse(match.kickoff) : NaN;
  return Number.isFinite(time) ? time : null;
};

// Annulé, abandonné, acté sur tapis vert ou par forfait : ne se jouera plus.
export function isMatchVoid(match) {
  return VOID_SHORT.has(shortOf(match));
}

// Reporté sans nouvelle date exploitable.
export function isMatchPostponed(match) {
  const short = shortOf(match);
  if (INTERRUPTED_SHORT.has(short) || VOID_SHORT.has(short)) return false;
  return short === "PST" || match?.status === "postponed";
}

// Commencé, en cours ou joué : la journée de ce match est entamée.
export function isMatchStarted(match, now = Date.now()) {
  if (isMatchVoid(match) || isMatchPostponed(match)) return false;
  if (isMatchOver(match, now) || isMatchLive(match)) return true;
  const kickoff = kickoffOf(match);
  return kickoff != null && kickoff <= now;
}

// Encore à jouer (ou en train de se jouer) : ni terminé, ni annulé, ni reporté
// sans date, ni bloqué au-delà de 3 h après son coup d'envoi.
export function isMatchPending(match, now = Date.now()) {
  if (!match || isMatchOver(match, now) || isMatchVoid(match) || isMatchPostponed(match)) return false;
  const kickoff = kickoffOf(match);
  return kickoff == null || kickoff >= now - STALE_AFTER_MS;
}

const byKickoff = (a, b) => (kickoffOf(a) ?? Infinity) - (kickoffOf(b) ?? Infinity);

// Prochaine journée : la première, dans l'ordre chronologique, dont aucun match
// n'a commencé et qui compte au moins un match à venir. Retourne la journée
// complète (matchs reportés compris), ou null s'il n'y en a pas.
export function nextMatchday(matches = [], now = Date.now()) {
  const rounds = new Map();
  for (const match of matches) {
    if (match?.round_number == null) continue;
    const round = rounds.get(match.round_number) || { round: match.round_number, matches: [], started: false, pending: false, firstKickoff: Infinity };
    round.matches.push(match);
    if (isMatchStarted(match, now)) round.started = true;
    if (isMatchPending(match, now)) {
      round.pending = true;
      round.firstKickoff = Math.min(round.firstKickoff, kickoffOf(match) ?? Infinity);
    }
    rounds.set(match.round_number, round);
  }
  const next = [...rounds.values()]
    .filter((round) => !round.started && round.pending)
    .sort((a, b) => (a.firstKickoff - b.firstKickoff) || (a.round - b.round))[0];
  return next ? { round: next.round, matches: [...next.matches].sort(byKickoff) } : null;
}

// Sans journée numérotée (coupes) ou après la dernière journée : les prochains
// matchs réellement à venir, par date.
export function upcomingMatches(matches = [], now = Date.now(), limit = 10) {
  return matches.filter((match) => isMatchPending(match, now)).sort(byKickoff).slice(0, limit);
}

// Saison terminée : chaque match est joué (isMatchOver) ou ne se jouera plus.
export function isSeasonOver(matches = [], now = Date.now()) {
  return matches.length > 0 && matches.every((match) => isMatchOver(match, now) || isMatchVoid(match));
}
