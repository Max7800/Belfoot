// Jeux de données volumineux (au-delà du plafond Supabase de 1 000 lignes).
// Les identifiants sont triables (club-00001…) pour des ordres stables.

export const pad = (value) => String(value).padStart(5, "0");
export const clubId = (index) => `club-${pad(index)}`;
export const playerId = (index) => `player-${pad(index)}`;

export function manyClubs(count, source = "testprov", extra = () => ({})) {
  return Array.from({ length: count }, (_, i) => ({ id: clubId(i + 1), source, external_id: String(i + 1), name: `Club ${i + 1}`, team_type: "first_team", locked: false, ext: {}, ...extra(i + 1) }));
}

export function manyPlayers(count, source = "testprov") {
  return Array.from({ length: count }, (_, i) => ({ id: playerId(i + 1), source, external_id: String(i + 1), name: `Joueur ${i + 1}`, locked: false, active: true, tracked: false }));
}
