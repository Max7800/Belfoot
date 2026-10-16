// Classements par groupe pour toute phase à plusieurs groupes (qualifications
// U21, phases de groupes de tournois…). La Ligue des nations garde sa propre
// logique (lib/nationsLeague.js, divisions A-D).
//
// Règles :
// - seuls les groupes officiels de LA saison affichée sont utilisés
//   (ext.standings_by_season[saison]) ; jamais ceux d'une autre campagne ;
// - un groupe ne vaut pour la phase affichée que si ses équipes y jouent ;
// - le mode « groupes » exige une vraie partition : aucun match de la phase
//   n'oppose deux groupes différents (sinon : tableau unique habituel) ;
// - classement officiel conservé s'il est au moins aussi à jour que les matchs
//   (critères officiels, confrontations directes) ; sinon recalculé ;
// - « classement des deuxièmes » et assimilés : affichés tels que fournis ;
// - sans classement officiel : groupes reconstitués depuis les matchs, signalés.
import { computeStandings } from "./standings";
import { isMatchOver } from "./matchStatus";
import { isNationsLeagueCompetition } from "./nationsLeague";

const RANKING_GROUP = /\b(ranking|best|second|third|runners?-up)\b|classement|meilleur|deuxi[eè]me|troisi[eè]me/i;

export function isRankingGroup(label) {
  return RANKING_GROUP.test(String(label || ""));
}

// « Group A » → « Groupe A », « Group 3 » → « Groupe 3 ». Libellé inconnu : conservé.
export function groupDisplayLabel(label, fallback = "Groupe") {
  const text = String(label || "").trim();
  if (/second|deuxi/i.test(text) && isRankingGroup(text)) return "Classement des deuxièmes";
  if (/third|troisi/i.test(text) && isRankingGroup(text)) return "Classement des troisièmes";
  const group = text.match(/\bgroup(?:e)?\s+([A-Z0-9]{1,2})\b/i)?.[1];
  return group ? `Groupe ${group.toUpperCase()}` : (text || fallback);
}

const bothKnown = (match) => match?.home_club_id && match?.away_club_id;
const byRank = (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity);
const RESULT_FIELDS = ["won", "drawn", "lost", "gf", "ga"];
const num = (value) => Number(value) || 0;

// Le classement officiel (instantané de la dernière synchro complète) reste
// prioritaire tant qu'aucune équipe n'a, en base, un résultat qu'il ignore :
// - plus de matchs joués en base (résultat arrivé par le direct) → périmé ;
// - autant de matchs mais bilan différent (score corrigé) → périmé ;
// - moins de matchs en base (import partiel) → l'officiel est plus complet.
// Les points ne sont pas comparés : une pénalité officielle reste respectée.
// Avec une date d'instantané (ext.full_competition_seasons[saison], posée par la
// synchro complète qui a enregistré le classement), l'officiel fait foi pour tout
// match commencé avant lui (marge de 3 h pour un match alors en cours) : résultats
// annulés (Russie U21 exclue en 2022), pénalités et tapis verts sont respectés.
// Seul un match commencé après l'instantané le rend périmé.
const LIVE_MARGIN_MS = 10800000;
function officialIsCurrent(officialRows, freshRows, groupMatches = [], snapshotMs = null) {
  if (snapshotMs != null) return !groupMatches.some((match) => isMatchOver(match) && Date.parse(match.kickoff || 0) >= snapshotMs - LIVE_MARGIN_MS);
  const official = new Map(officialRows.map((row) => [row.club, row]));
  return freshRows.every((fresh) => {
    const row = official.get(fresh.club);
    if (!row) return false;
    if (fresh.played > num(row.played)) return false;
    if (fresh.played < num(row.played)) return true;
    return RESULT_FIELDS.every((field) => num(fresh[field]) === num(row[field]));
  });
}

// Classement recalculé, complété par les équipes du groupe sans match joué.
function freshRows(teamIds, matches) {
  const rows = computeStandings(matches.filter(isMatchOver));
  const present = new Set(rows.map((row) => row.club));
  for (const club of teamIds) if (!present.has(club)) rows.push({ club, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
  return rows;
}

function officialGroups(stored, phaseMatches, snapshotMs = null) {
  const phaseTeams = new Set(phaseMatches.flatMap((match) => [match.home_club_id, match.away_club_id]).filter(Boolean));
  const groups = [];
  const rankings = [];
  for (const group of stored) {
    const rows = (group?.rows || []).filter((row) => row?.club);
    const teamIds = [...new Set(rows.map((row) => row.club))];
    if (!teamIds.length || !teamIds.some((id) => phaseTeams.has(id))) continue;
    if (isRankingGroup(group.label)) {
      rankings.push({ kind: "ranking", label: group.label, official: true, source: "official", rows: [...rows].sort(byRank) });
      continue;
    }
    const teamSet = new Set(teamIds);
    const groupMatches = phaseMatches.filter((match) => bothKnown(match) && teamSet.has(match.home_club_id) && teamSet.has(match.away_club_id));
    const fresh = freshRows(teamIds, groupMatches);
    const upToDate = officialIsCurrent(rows, fresh, groupMatches, snapshotMs);
    groups.push({
      kind: "group",
      label: group.label,
      official: true,
      source: upToDate ? "official" : "computed",
      teamIds,
      rows: upToDate ? [...rows].sort(byRank) : fresh,
    });
  }
  return { groups, rankings };
}

// Vraie partition : groupes disjoints et aucun match de la phase entre deux groupes.
function isPartition(groups, phaseMatches) {
  const owner = new Map();
  for (const [index, group] of groups.entries()) {
    for (const id of group.teamIds) {
      if (owner.has(id) && owner.get(id) !== index) return false;
      owner.set(id, index);
    }
  }
  return phaseMatches.filter(bothKnown).every((match) => owner.get(match.home_club_id) === owner.get(match.away_club_id));
}

function detectedGroups(phaseMatches, clubs) {
  const parent = new Map();
  const find = (id) => {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
    return parent.get(id);
  };
  const known = phaseMatches.filter(bothKnown);
  for (const match of known) {
    const a = find(match.home_club_id); const b = find(match.away_club_id);
    if (a !== b) parent.set(b, a);
  }
  const components = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(id);
  }
  // Au moins deux groupes d'au moins trois équipes : des paires isolées sont
  // des confrontations à élimination, pas des groupes.
  if (components.size < 2 || [...components.values()].some((teamIds) => teamIds.length < 3)) return [];
  const nameOf = (id) => clubs[id]?.name || id;
  return [...components.values()]
    .map((teamIds) => ({ teamIds, first: teamIds.map(nameOf).sort((a, b) => a.localeCompare(b, "fr"))[0] || "" }))
    .sort((a, b) => a.first.localeCompare(b.first, "fr"))
    .map(({ teamIds }, index) => {
      const teamSet = new Set(teamIds);
      return {
        kind: "group",
        label: `Groupe détecté ${index + 1}`,
        official: false,
        source: "computed",
        teamIds,
        rows: freshRows(teamIds, known.filter((match) => teamSet.has(match.home_club_id))),
      };
    });
}

// Groupes de la phase affichée, ou [] pour un tableau unique habituel.
// `seasonLabel` doit être la saison des `phaseMatches` (aucun mélange de campagnes).
export function phaseGroups(competition, seasonLabel, phaseMatches = [], clubs = {}) {
  const stored = seasonLabel ? competition?.ext?.standings_by_season?.[seasonLabel] : null;
  if (Array.isArray(stored) && stored.length) {
    const snapshot = Date.parse(competition?.ext?.full_competition_seasons?.[seasonLabel] || "");
    const { groups, rankings } = officialGroups(stored, phaseMatches, Number.isFinite(snapshot) ? snapshot : null);
    if (groups.length >= 2 && isPartition(groups, phaseMatches)) {
      return [...groups.sort((a, b) => String(a.label).localeCompare(String(b.label), "fr", { numeric: true })), ...rankings];
    }
    // Un seul tableau officiel pour la phase : pas de reconstruction hasardeuse.
    if (groups.length === 1) return [];
    // Plusieurs groupes officiels contredits par les matchs (cas réel : l'API a
    // renvoyé pour la saison U21 2025 les groupes de la campagne 2023) : groupes
    // reconstitués depuis les matchs, signalés « détecté ». Une ligue dont les
    // groupes se chevauchent (Pro League) forme une seule composante : tableau unique.
  }
  return detectedGroups(phaseMatches, clubs);
}

// Regroupe en une seule « phase de groupes » les phases dont tous les matchs
// restent à l'intérieur d'un même groupe officiel de la saison. Cas réel : la
// campagne U21 2023 (API 850, saison 2023) range ses matchs de groupe sous
// « Group A » … « Group I » ET 52 d'entre eux sous « Ranking of second-placed
// teams » ; chaque phase seule donnerait un classement amputé.
// Conditions strictes (sinon les matchs sont rendus tels quels) :
// - groupes officiels de CETTE saison, au moins deux, disjoints (une ligue dont
//   l'API renvoie aussi des groupes de play-offs, ex. Pro League, est exclue) ;
// - Ligue des nations exclue (logique de divisions propre) ;
// - au moins deux phases concernées, jamais une phase à élimination directe.
// Le libellé de tour (round_raw) n'est pas modifié ; seule la phase affichée l'est.
export const MERGED_GROUP_PHASE = "Group Stage";

export function mergeGroupStagePhases(competition, seasonLabel, matches = [], { isKnockout = () => false } = {}) {
  if (isNationsLeagueCompetition(competition)) return matches;
  const stored = seasonLabel ? competition?.ext?.standings_by_season?.[seasonLabel] : null;
  if (!Array.isArray(stored)) return matches;
  const owner = new Map();
  let regular = 0;
  for (const [index, group] of stored.entries()) {
    if (isRankingGroup(group?.label)) continue;
    const teams = [...new Set((group?.rows || []).map((row) => row?.club).filter(Boolean))];
    if (!teams.length) continue;
    regular += 1;
    for (const club of teams) {
      if (owner.has(club)) return matches; // groupes qui se chevauchent : pas une phase de groupes
      owner.set(club, index);
    }
  }
  if (regular < 2) return matches;
  const byPhase = new Map();
  for (const match of matches) {
    const phase = match?.phase;
    if (!phase || isKnockout(phase)) continue;
    if (!byPhase.has(phase)) byPhase.set(phase, []);
    byPhase.get(phase).push(match);
  }
  const merged = new Set([...byPhase.entries()].filter(([, phaseMatches]) => {
    const known = phaseMatches.filter(bothKnown);
    return known.length > 0 && known.every((match) => owner.has(match.home_club_id) && owner.get(match.home_club_id) === owner.get(match.away_club_id));
  }).map(([phase]) => phase));
  if (merged.size < 2) return matches;
  return matches.map((match) => merged.has(match?.phase) ? { ...match, phase: MERGED_GROUP_PHASE } : match);
}
