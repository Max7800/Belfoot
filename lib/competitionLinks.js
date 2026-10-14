// Lien vers la page Belfoot d'une compétition, à partir de sa LIGNE en base
// (identifiant stable `competition_id`, jamais une comparaison de noms).
//
// - aucune ligne, identifiant vide, compétition masquée au public : pas de lien
//   (la page d'une compétition masquée n'est pas une page publique utile) ;
// - URL canonique du site (competitionPath) quand la route la ramène bien à
//   CETTE compétition ;
// - sinon (homonymes sans slug, ex. trois « Pro League »), ou si la liste de
//   vérification est indisponible : /competitions/<id>, que la même route
//   (resolveCompetitionRoute) résout exactement par identifiant.
import { competitionPath, competitionRouteKey, resolveCompetitionRoute } from "./competitionRoutes";

const validId = (value) => value != null && String(value).trim() !== "";

export function competitionHref(competition, allCompetitions = null) {
  if (!competition || !validId(competition.id)) return null;
  if (competition.public_visible === false) return null;
  const key = competitionRouteKey(competition);
  if (!key) return null;
  const idPath = `/competitions/${encodeURIComponent(String(competition.id))}`;
  if (!Array.isArray(allCompetitions) || !allCompetitions.length) return idPath;
  const resolved = resolveCompetitionRoute(allCompetitions, key);
  return String(resolved?.id) === String(competition.id) ? competitionPath(competition) : idPath;
}

// Liens de toutes les compétitions chargées, indexés par identifiant.
export function competitionHrefs(competitionsById = {}, allCompetitions = null) {
  return Object.fromEntries(Object.values(competitionsById || {})
    .filter((competition) => competition && validId(competition.id))
    .map((competition) => [String(competition.id), competitionHref(competition, allCompetitions)]));
}
