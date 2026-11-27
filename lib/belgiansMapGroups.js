// Regroupement géographique partagé par la carte et ses contrôles.
// Nom pays Belfoot -> nom du fond de carte (world-atlas). À ajuster au fil de l'eau.
const COUNTRY_ALIAS = {
  "England": "United Kingdom", "Scotland": "United Kingdom", "Wales": "United Kingdom", "Northern Ireland": "United Kingdom",
  "USA": "United States of America", "United States": "United States of America",
  "Türkiye": "Turkey", "Czechia": "Czech Republic", "Czech Republic": "Czech Republic",
  "South Korea": "South Korea", "North Macedonia": "North Macedonia", "Bosnia & Herzegovina": "Bosnia and Herz.",
  "Ivory Coast": "Côte d'Ivoire", "Saudi Arabia": "Saudi Arabia", "UAE": "United Arab Emirates",
  "Serbia": "Serbia", "Russia": "Russia", "Netherlands": "Netherlands",
};
export const geoName = (c) => COUNTRY_ALIAS[c] || c;

export function groupMapPlayers(players, unknownCountry) {
  const map = {};
  for (const p of players) {
    const raw = p?.country;
    if (!raw || raw === unknownCountry) continue;
    const name = geoName(raw);
    (map[name] ||= { key: name, label: name === "United Kingdom" ? "Royaume-Uni" : raw, list: [] }).list.push(p);
  }
  return map;
}
