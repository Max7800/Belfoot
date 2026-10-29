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
// Anciennes adresses (ext.route_aliases) : toujours valables après le passage aux
// noms et adresses en français (30/10/2026, « champion-s-league » → « ligue-des-champions »).
// Homonymes : la compétition visible passe avant les masquées (/competitions/pro-league
// menait à une « Pro League » étrangère masquée).
export function resolveCompetitionRoute(competitions = [], routeParam = "") {
  const value = routeValue(routeParam);
  const key = slugify(value);
  const ordered = [...competitions].sort((a, b) => Number(b.public_visible !== false) - Number(a.public_visible !== false));
  const aliases = (competition) => (Array.isArray(competition.ext?.route_aliases) ? competition.ext.route_aliases : []).map(slugify);

  return ordered.find((competition) =>
    String(competition.id) === value ||
    String(competition.slug || "") === value
  ) || ordered.find((competition) =>
    competitionRouteKey(competition) === key ||
    slugify(competition.name || "") === key ||
    slugify(competition.id || "") === key
  ) || ordered.find((competition) => aliases(competition).includes(key)) || null;
}
