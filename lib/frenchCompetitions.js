// Noms de compétitions en français (30/10/2026 : « même le nom des compétitions
// devrait être francisé »). API-Football les donne en anglais ; Belfoot les
// enregistre en français à la création (modules/football/sync.js) et un SQL a
// renommé l'existant. Les noms propres (Pro League, Bundesliga, DFB Pokal…) restent.
import { frenchNationName } from "./frenchNations";

const EXACT = {
  "Champion's league": "Ligue des champions", "UEFA Champions League": "Ligue des champions", "Champions League": "Ligue des champions",
  "Europa League": "Ligue Europa", "UEFA Europa League": "Ligue Europa",
  "Conférence League": "Ligue Conférence", "UEFA Europa Conference League": "Ligue Conférence", "UEFA Conference League": "Ligue Conférence", "Conference League": "Ligue Conférence",
  "UEFA Nations League": "Ligue des nations", "UEFA Super Cup": "Supercoupe d'Europe", "UEFA Youth League": "Ligue de la jeunesse de l'UEFA",
  "UEFA U21 Championship": "Euro U21", "UEFA U19 Championship": "Euro U19", "UEFA U17 Championship": "Euro U17",
  "UEFA U21 Championship - Qualification": "Qualifications Euro U21", "UEFA U19 Championship - Qualification": "Qualifications Euro U19", "UEFA U17 Championship - Qualification": "Qualifications Euro U17",
  "Euro Championship": "Euro", "Euro Championship - Qualification": "Qualifications Euro",
  "World Cup": "Coupe du monde", "World Cup - U17": "Coupe du monde U17", "World Cup - U20": "Coupe du monde U20",
  "World Cup - Qualification Europe": "Qualifications Coupe du monde (Europe)", "World Cup - Qualification Africa": "Qualifications Coupe du monde (Afrique)",
  "World Cup - Qualification Asia": "Qualifications Coupe du monde (Asie)", "World Cup - Qualification CONCACAF": "Qualifications Coupe du monde (CONCACAF)",
  "World Cup - Qualification South America": "Qualifications Coupe du monde (Amérique du Sud)", "World Cup - Qualification Intercontinental Play-offs": "Barrages intercontinentaux de la Coupe du monde",
  "FIFA Club World Cup": "Coupe du monde des clubs", "FIFA Intercontinental Cup": "Coupe intercontinentale",
  "Friendlies": "Matchs amicaux", "Friendlies Clubs": "Matchs amicaux de clubs", "Friendlies Women": "Matchs amicaux féminins",
  "Olympics Men": "Jeux olympiques", "Africa Cup of Nations": "Coupe d'Afrique des nations", "Africa Cup of Nations U20": "Coupe d'Afrique des nations U20",
  "CONCACAF Nations League": "Ligue des nations de la CONCACAF", "Copa del Rey": "Coupe du Roi",
};

// Noms génériques : complétés par le pays (« Cup » → « Coupe (Angleterre) »).
const GENERIC = { "Cup": "Coupe", "Super Cup": "Supercoupe", "League Cup": "Coupe de la Ligue", "State Cup": "Coupe d'État" };

// Noms portés par plusieurs championnats de pays différents : pays entre parenthèses,
// sauf en Belgique (la Pro League du site reste « Pro League »).
export const SHARED_NAMES = new Set(["Pro League", "Premier League", "Bundesliga", "Serie A", "Serie B", "Super League", "Superliga", "Super Liga", "Premiership", "First League", "Second League", "Second Division", "Super League 1", "1. Division", "2. Liga", "Liga I", "Liga II", "Primera División"]);

export function frenchCompetitionName(name, country = null) {
  const key = String(name || "").trim();
  if (!key) return name;
  // Pays de l'API parfois avec des tirets (« Saudi-Arabia ») : espaces avant traduction.
  const countryName = String(country || "").trim().replace(/-/g, " ");
  const place = countryName && !/^(belgium|belgique)$/i.test(countryName) ? frenchNationName(countryName) : null;
  if (Object.hasOwn(EXACT, key)) return EXACT[key];
  if (Object.hasOwn(GENERIC, key)) return place ? `${GENERIC[key]} (${place})` : GENERIC[key];
  if (SHARED_NAMES.has(key) && place && !/^world$/i.test(String(country))) return `${key} (${place})`;
  return key;
}
