// Noms de clubs en français (30/10/2026) : API-Football les donne en anglais ou
// dans la langue locale (« Standard Liege », « St. Truiden », « Bayern München »).
// Appliqué à chaque écriture d'un club (modules/football/sync.js, storedClubName)
// — l'API réécrit le nom à chaque synchronisation — et aux noms bruts des
// transferts à l'affichage. Usage de la presse belge francophone ; les noms
// déjà usuels tels quels (Genk, Anderlecht, Ajax, Celtic…) ne sont pas listés.
const CLUBS = {
  // Belgique
  "Standard Liege": "Standard de Liège", "Standard Liège": "Standard de Liège",
  "St. Truiden": "Saint-Trond", "Sint-Truiden": "Saint-Trond", "STVV": "Saint-Trond",
  "Union St. Gilloise": "Union Saint-Gilloise", "Royale Union SG": "Union Saint-Gilloise",
  "Club Brugge KV": "Club Bruges", "Club Brugge": "Club Bruges", "Club Brugge II": "Club Bruges II", "Club Brugge U19": "Club Bruges U19", "Club Brugge U21": "Club Bruges U21",
  "Cercle Brugge": "Cercle Bruges", "Cercle Brugge II": "Cercle Bruges II",
  "KV Mechelen": "KV Malines", "Mechelen": "KV Malines",
  "OH Leuven": "OH Louvain", "Oud-Heverlee Leuven": "OH Louvain",
  "Gent": "La Gantoise", "KAA Gent": "La Gantoise", "KAA Gent II": "La Gantoise II", "Gent U19": "La Gantoise U19",
  "Kortrijk": "Courtrai", "KV Kortrijk": "Courtrai",
  "KVC Westerlo": "Westerlo", "SK Beveren": "Beveren", "Beerschot VA": "Beerschot", "K. Lierse S.K.": "Lierse",
  "Seraing United": "Seraing", "KRC Genk": "Genk", "Charleroi": "Sporting Charleroi",
  // Étranger
  "Paris Saint Germain": "Paris Saint-Germain", "Bayern München": "Bayern Munich", "Bayern Munchen": "Bayern Munich",
  "Spartak Moscow": "Spartak Moscou", "CSKA Moscow": "CSKA Moscou", "Lokomotiv Moscow": "Lokomotiv Moscou", "Dynamo Moscow": "Dynamo Moscou",
  "Rapid Vienna": "Rapid Vienne", "Austria Vienna": "Austria Vienne", "Red Star Belgrade": "Étoile rouge de Belgrade", "Crvena Zvezda": "Étoile rouge de Belgrade",
  "Atletico Madrid": "Atlético Madrid", "Barcelona": "FC Barcelone", "Sevilla": "FC Séville", "Valencia": "Valence", "Athletic Club": "Athletic Bilbao",
  "Olympiakos Piraeus": "Olympiakos", "Lask Linz": "LASK", "Inter": "Inter Milan", "Napoli": "Naples", "AS Roma": "AS Rome", "Lazio": "Lazio Rome",
  "Borussia Monchengladbach": "Borussia Mönchengladbach", "1. FC Köln": "FC Cologne", "FC Koln": "FC Cologne", "Eintracht Frankfurt": "Eintracht Francfort",
  "FC Copenhagen": "FC Copenhague", "Slavia Praha": "Slavia Prague", "Sparta Praha": "Sparta Prague", "Dynamo Kyiv": "Dynamo Kiev",
  "Fenerbahce": "Fenerbahçe", "Besiktas": "Beşiktaş", "Basel": "FC Bâle", "FC Basel 1893": "FC Bâle",
  "Monaco": "AS Monaco", "Marseille": "Olympique de Marseille", "Lyon": "Olympique lyonnais", "Wolves": "Wolverhampton",
};

export function frenchClubName(name) {
  if (typeof name !== "string") return name;
  const key = name.trim();
  return Object.hasOwn(CLUBS, key) ? CLUBS[key] : key;
}
