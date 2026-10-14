// État explicite d'une saison publique, partagé par les pages Compétition,
// Classement et Matchs : jamais de page vide ambiguë, jamais de matchs mélangés.
export function seasonNotice({ unpublished = false, season = null, matchCount = 0, loading = false, error = "" } = {}) {
  if (loading || error) return null;
  if (unpublished) return { kind: "unpublished", title: "Aucune saison publiée.", text: "Les saisons de cette compétition sont en cours de préparation : leurs matchs et classements apparaîtront dès leur publication." };
  if (season && matchCount === 0) return { kind: "empty", title: `Saison ${season.label} à venir.`, text: "Aucun match n'est encore disponible pour cette saison : le calendrier et le classement apparaîtront dès l'import des premiers matchs." };
  return null;
}
