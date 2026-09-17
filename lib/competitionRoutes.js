import { slugify } from "./slugify";

function routeValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null) return "";
  try {
    return decodeURIComponent(String(raw));
  } catch {
    return String(raw);
  }
}

export function competitionRouteKey(competition) {
  if (!competition) return "";
  return slugify(competition.slug || competition.name || competition.id);
}

export function competitionPath(competition) {
  const key = competitionRouteKey(competition);
  return key ? `/competitions/${key}` : "/competitions";
}

// Les anciennes lignes peuvent avoir un slug non normalisé (ex. "Croky Cup").
// On conserve leur accès tout en générant désormais une URL canonique.
export function resolveCompetitionRoute(competitions = [], routeParam = "") {
  const value = routeValue(routeParam);
  const key = slugify(value);

  return competitions.find((competition) =>
    String(competition.id) === value ||
    String(competition.slug || "") === value
  ) || competitions.find((competition) =>
    competitionRouteKey(competition) === key ||
    slugify(competition.name || "") === key ||
    slugify(competition.id || "") === key
  ) || null;
}
