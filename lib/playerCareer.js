// Club ACTUEL d'un joueur et marqueur « actuel » du parcours en club.
//
// Constat de l'audit du 26/10/2026 : la fiche prenait la première affectation
// « active et principale » — souvent celle de la SÉLECTION (Belgium 2026) —
// et affichait « Belgium » comme club ; toute affectation encore active
// (Manchester City 2024) était aussi marquée « actuel ».
//
// Règle : jamais une sélection nationale ; parmi les affectations actives en
// club, la saison la plus récente (la principale d'abord, sinon la plus
// récemment rejointe) ; à défaut le club_id de la fiche s'il n'est pas une
// sélection ; à défaut la dernière affectation en club connue.
import { isNationalSelectionClub } from "./nationalities";

const seasonStart = (membership) => Number(membership?.season_start_year) || Number((String(membership?.season || "").match(/\d{4}/) || [0])[0]) || 0;
const joinedAt = (membership) => Date.parse(membership?.joined_at || membership?.updated_at || membership?.created_at || "") || 0;

export function resolveCurrentClubId({ player, memberships = [], clubsById = {} } = {}) {
  const isClub = (clubId) => Boolean(clubId) && !isNationalSelectionClub(clubsById[clubId], player?.nationality);
  const inClub = memberships.filter((membership) => isClub(membership.club_id));
  const active = inClub.filter((membership) => membership.active);
  if (active.length) {
    const latest = Math.max(...active.map(seasonStart));
    const candidates = active.filter((membership) => seasonStart(membership) === latest);
    const primary = candidates.filter((membership) => membership.is_primary);
    return [...(primary.length ? primary : candidates)].sort((a, b) => joinedAt(b) - joinedAt(a))[0].club_id;
  }
  if (isClub(player?.club_id)) return player.club_id;
  return [...inClub].sort((a, b) => seasonStart(b) - seasonStart(a) || joinedAt(b) - joinedAt(a))[0]?.club_id || null;
}

// Période d'une ligne de parcours, toujours en saisons « 2026-2027 » (le libellé
// stocké pouvait n'être que « 2026 ») ; plusieurs saisons : « 2015 — 2025 ».
function stintRange({ start, end, seasons }) {
  if (!start) return seasons[0]?.season || "";
  return start === end ? `${start}-${start + 1}` : `${start} — ${end + 1}`;
}

// Parcours en club (une ligne par club), « actuel » sur le seul club actuel.
export function careerStints(memberships = [], currentClubId = null) {
  const stints = new Map();
  for (const membership of memberships) {
    const key = membership.club_id || membership.id;
    const start = seasonStart(membership);
    const stint = stints.get(key) || { ...membership, seasons: [], start, end: start };
    stint.seasons.push(membership);
    stint.start = Math.min(stint.start || start, start || stint.start);
    stint.end = Math.max(stint.end || start, start || stint.end);
    stints.set(key, stint);
  }
  return [...stints.values()]
    .map((stint) => ({ ...stint, range: stintRange(stint), is_current: Boolean(currentClubId) && stint.club_id === currentClubId }))
    .sort((a, b) => Number(b.is_current) - Number(a.is_current) || (b.end || 0) - (a.end || 0));
}

// Résumé de carte (page Belges) : saison d’arrivée au club actuel et clubs
// précédents, du plus récent au plus ancien, sélections écartées.
export function careerSummary(memberships = [], currentClubId = null, clubsById = {}, { limit = 3, nationality = null } = {}) {
  const clubRows = memberships.filter((membership) => membership.club_id && !isNationalSelectionClub(clubsById[membership.club_id], nationality));
  const stints = careerStints(clubRows, currentClubId);
  const current = stints.find((stint) => stint.is_current);
  const previous = stints.filter((stint) => !stint.is_current && clubsById[stint.club_id]?.name);
  return {
    since: current?.start || null,
    previous: previous.slice(0, limit).map((stint) => ({ id: stint.club_id, name: clubsById[stint.club_id].name, range: stint.range })),
    more: Math.max(0, previous.length - limit),
  };
}
