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

// Les onglets fondés sur les matchs peuvent être affichés avant les statistiques.
export function competitionTabLoading({ tab, seasonLoading, matchesReady, dataError }) {
  const matchDependent = ["matchs", "classement", "clubs"].includes(tab);
  return {
    showLoader: (seasonLoading && (!matchDependent || !matchesReady)) || (matchDependent && !matchesReady && !dataError),
    showMatchData: matchDependent && matchesReady,
  };
}
