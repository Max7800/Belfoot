// Charge le calendrier avant les effectifs et statistiques de la saison.
// Une navigation entre deux lectures ne doit jamais publier l'ancienne saison.
export async function loadCompetitionMatchesStage({ loadMatches, loadClubs, isCurrent, onReady }) {
  const matches = await loadMatches();
  if (!isCurrent()) return null;
  const clubs = await loadClubs(matches);
  if (!isCurrent()) return null;
  onReady({ matches, clubs });
  return { matches, clubs };
}
