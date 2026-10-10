import { seasonLabel } from "./season";

// Saison d'un match de sélection, à partir de la saison fournie par l'API
// (`league.season`, une année YYYY). La saison API est la source de vérité :
// elle n'est jamais rejetée à cause de la date du match, car les campagnes
// internationales (qualifications, Nations League, jeunes) ne suivent pas
// toutes la même convention. Un écart inhabituel est seulement signalé.
//
// Une valeur absente ou ambiguë ne donne AUCUNE saison : pas de repli sur la
// saison demandée par le cron ni sur l'année en cours (seasonLabel("") renverrait
// silencieusement l'année courante).

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

// Écart habituel entre l'année du coup d'envoi et la saison API :
// qualifications jouées jusqu'à trois ans avant (−3) et campagnes qui se
// terminent l'année suivante (+1). Purement informatif.
export const USUAL_KICKOFF_GAP = { min: -3, max: 1 };

export function providerSeasonYear(value) {
  let year = null;
  if (typeof value === "number") year = value;
  else if (typeof value === "string" && /^\d{4}$/.test(value.trim())) year = Number(value.trim());
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  return year;
}

function kickoffYear(kickoff) {
  if (!kickoff) return null;
  const date = new Date(kickoff);
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}

// -> { label: "2024-2025" | null, year, gap, unusual }
export function resolveNationalMatchSeason(match) {
  const year = providerSeasonYear(match?.league_season);
  if (year === null) return { label: null, year: null, gap: null, unusual: false };
  const playedYear = kickoffYear(match?.kickoff);
  const gap = playedYear === null ? null : playedYear - year;
  const unusual = gap !== null && (gap < USUAL_KICKOFF_GAP.min || gap > USUAL_KICKOFF_GAP.max);
  return { label: seasonLabel(String(year)), year, gap, unusual };
}
