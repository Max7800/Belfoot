// Comparaison de texte pour les recherches : casse et accents ignorés
// (« conference » trouve « Conférence League », « belgique » trouve « Belgique »).
export const foldText = (text) => String(text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

// Tous les mots de la requête doivent apparaître dans au moins un des champs.
export function matchesQuery(fields, query) {
  const wanted = foldText(query);
  if (!wanted) return true;
  return wanted.split(/\s+/).every((word) => fields.some((field) => foldText(field).includes(word)));
}
