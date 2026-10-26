// Métadonnées des pages publiques (titre d'onglet, description, aperçu de
// partage) construites côté serveur. Fonctions pures : les données sont lues
// par les layout.js de chaque route (lib/publicServerClient.js).
import { buildMetadata } from "./seo";
import { frenchNationName } from "./frenchNations";
import { competitionPath } from "./competitionRoutes";
import { COMPETITION_SCOPE_BY_KEY, resolveCompetitionScope } from "./competitionScopes";
import { positionLabel } from "./positions";

const join = (parts) => parts.filter(Boolean).join(" · ");
const noindex = { robots: { index: false, follow: false } };

export function playerMetadata(player, club) {
  if (!player) return buildMetadata({ title: "Joueur introuvable" });
  const position = positionLabel(player.position);
  // Nationalités multiples (« RD Congo, Belgium ») : traduites une à une.
  const nationalities = String(player.nationality || "").split(/\s*,\s*/).filter(Boolean).map(frenchNationName).join(", ");
  const description = join([position, club?.name, nationalities]) || `Fiche de ${player.name}`;
  return buildMetadata({ title: club?.name ? `${player.name} — ${club.name}` : player.name, description: `${player.name} : ${description}. Statistiques, matchs et parcours.`, image: player.photo_url || null, path: `/players/${player.id}` });
}

export function clubMetadata(club) {
  if (!club) return buildMetadata({ title: "Club introuvable" });
  const country = frenchNationName(club.country);
  return buildMetadata({ title: club.name, description: `${club.name}${country ? ` (${country})` : ""} : effectif, matchs, résultats et statistiques.`, image: club.logo_url || null, path: `/clubs/${club.id}` });
}

export function competitionMetadata(competition, season = null) {
  if (!competition) return buildMetadata({ title: "Compétition introuvable" });
  const name = competition.header_title?.trim() || competition.name;
  const scope = COMPETITION_SCOPE_BY_KEY[resolveCompetitionScope(competition)]?.label;
  const metadata = buildMetadata({
    title: season ? `${name} ${season}` : name,
    description: `${name}${scope ? ` (${scope})` : ""} : classement, calendrier, résultats et statistiques${season ? ` de la saison ${season}` : ""}.`,
    image: competition.banner_url || competition.logo_url || null,
    path: competitionPath(competition),
  });
  // Compétition masquée : jamais indexée, même quand le site le sera.
  return competition.public_visible === false ? { ...metadata, ...noindex } : metadata;
}

export function matchMetadata(match, home, away, competition) {
  if (!match) return buildMetadata({ title: "Match introuvable" });
  const homeName = home?.name || "?";
  const awayName = away?.name || "?";
  const teams = `${homeName} – ${awayName}`;
  const finished = match.status === "finished" && match.home_score != null && match.away_score != null;
  const date = match.kickoff ? new Date(match.kickoff).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" }) : null;
  return buildMetadata({
    // « Gent 2-1 Club Brugge » une fois terminé, « Gent – Club Brugge » sinon.
    title: finished ? `${homeName} ${match.home_score}-${match.away_score} ${awayName}` : teams,
    description: join([competition?.name, date, finished ? `Score final ${match.home_score}-${match.away_score}` : null]) || teams,
    image: home?.logo_url || null,
    path: `/matchs/${match.id}`,
  });
}
