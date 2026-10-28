// Lieux de naissance en français (players.ext.birth) : l'API les donne tantôt en
// néerlandais (Brussel, Antwerpen), tantôt en anglais (Brussels, Antwerp) ou en
// allemand (Brüssel). Relevé sur les 236 Belges suivis le 28/10/2026. Extensible.
import { frenchNationName } from "./frenchNations";

export const FR_PLACES = {
  "Brussel": "Bruxelles", "Brussels": "Bruxelles", "Brüssel": "Bruxelles", "Bruxelles": "Bruxelles",
  "Antwerpen": "Anvers", "Antwerp": "Anvers", "Gent": "Gand", "Ghent": "Gand", "Brugge": "Bruges",
  "Leuven": "Louvain", "Mechelen": "Malines", "Kortrijk": "Courtrai", "Sint-Truiden": "Saint-Trond",
  "Aalst": "Alost", "Ukkel": "Uccle", "Elsene": "Ixelles", "Liege": "Liège", "Luik": "Liège",
  "Halle": "Hal", "Hall": "Hal", "Lier": "Lierre", "Oostende": "Ostende", "Ostend": "Ostende",
  "Sint-Niklaas": "Saint-Nicolas", "Roeselare": "Roulers", "Tongeren": "Tongres", "Tienen": "Tirlemont",
  "Dendermonde": "Termonde", "Vilvoorde": "Vilvorde", "Herenthals": "Herentals", "Passendale": "Passchendaele",
  "Ieper": "Ypres", "Bergen": "Mons", "Namen": "Namur", "Doornik": "Tournai", "Nijvel": "Nivelles",
  "Moeskroen": "Mouscron", "Waver": "Wavre", "Geraardsbergen": "Grammont", "Oudenaarde": "Audenarde",
  "Ronse": "Renaix", "Zoutleeuw": "Léau", "Menen": "Menin", "Poperinge": "Poperinghe", "Veurne": "Furnes",
  "Baghdad": "Bagdad", "London": "Londres", "Amsterdam": "Amsterdam", "Cologne": "Cologne", "Köln": "Cologne",
  "Aachen": "Aix-la-Chapelle", "Maastricht": "Maastricht",
};

export function frenchPlaceName(name) {
  if (!name) return name;
  const key = String(name).trim();
  return Object.hasOwn(FR_PLACES, key) ? FR_PLACES[key] : key;
}

// « Liège » ; hors de Belgique, le pays en français : « Kinshasa (RD Congo) ».
export function birthPlaceLabel(birth) {
  const place = frenchPlaceName(birth?.place);
  const country = String(birth?.country || "").trim();
  const abroad = country && !/^(belgium|belgique)$/i.test(country) ? frenchNationName(country) : null;
  if (!place) return abroad;
  return abroad ? `${place} (${abroad})` : place;
}
