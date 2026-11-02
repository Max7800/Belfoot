// Comparaison tolérante aux accents pour la recherche, sans modifier les noms affichés.
export function searchText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr");
}

export function isRecentPerformance(match, now = Date.now(), maxDays = 45) {
  const date = Date.parse(match?.kickoff || "");
  return Number.isFinite(date) && date <= now && now - date <= maxDays * 86400000;
}

export function formatProviderCountry(value) {
  return String(value || "").replaceAll("-", " ");
}
