// Noms de sélections en français (anglais API → français), pour nommer les
// clubs "national" en français dès la synchronisation. Extensible.
export const FR_NATIONS = {
  "Belgium": "Belgique", "France": "France", "Scotland": "Écosse", "Switzerland": "Suisse", "Slovenia": "Slovénie",
  "FYR Macedonia": "Macédoine du Nord", "North Macedonia": "Macédoine du Nord", "San Marino": "Saint-Marin",
  "Albania": "Albanie", "Slovakia": "Slovaquie", "Kazakhstan": "Kazakhstan", "Czechia": "Tchéquie", "Czech Republic": "Tchéquie",
  "England": "Angleterre", "Luxembourg": "Luxembourg", "Iceland": "Islande", "Spain": "Espagne", "Croatia": "Croatie",
  "Bulgaria": "Bulgarie", "Estonia": "Estonie", "Netherlands": "Pays-Bas", "Germany": "Allemagne", "Norway": "Norvège",
  "Denmark": "Danemark", "Wales": "Pays de Galles", "Portugal": "Portugal", "Serbia": "Serbie", "Greece": "Grèce",
  "Italy": "Italie", "Türkiye": "Turquie", "Turkey": "Turquie", "Bosnia & Herzegovina": "Bosnie-Herzégovine",
  "Bosnia and Herzegovina": "Bosnie-Herzégovine", "Ukraine": "Ukraine", "Poland": "Pologne", "Austria": "Autriche",
  "Sweden": "Suède", "Finland": "Finlande", "Rep. Of Ireland": "Irlande", "Republic of Ireland": "Irlande", "Ireland": "Irlande",
  "Northern Ireland": "Irlande du Nord", "Hungary": "Hongrie", "Romania": "Roumanie", "Montenegro": "Monténégro",
  "Georgia": "Géorgie", "Armenia": "Arménie", "Latvia": "Lettonie", "Lithuania": "Lituanie", "Moldova": "Moldavie",
  "Malta": "Malte", "Cyprus": "Chypre", "Andorra": "Andorre", "Liechtenstein": "Liechtenstein", "Gibraltar": "Gibraltar",
  "Faroe Islands": "Îles Féroé", "Belarus": "Biélorussie", "Azerbaijan": "Azerbaïdjan", "Israel": "Israël", "Kosovo": "Kosovo",
  "Brazil": "Brésil", "Argentina": "Argentine", "Morocco": "Maroc", "USA": "États-Unis", "United States": "États-Unis",
  "Japan": "Japon", "South Korea": "Corée du Sud", "Senegal": "Sénégal", "Colombia": "Colombie", "Mexico": "Mexique",
  "Uruguay": "Uruguay", "Australia": "Australie", "Iran": "Iran", "Ivory Coast": "Côte d’Ivoire", "Saudi Arabia": "Arabie saoudite",
  "Canada": "Canada", "Nigeria": "Nigeria", "Egypt": "Égypte", "Cameroon": "Cameroun", "Ghana": "Ghana", "Qatar": "Qatar",
  "Bosnia-Herzegovina": "Bosnie-Herzégovine", "Tunisia": "Tunisie", "Algeria": "Algérie", "Russia": "Russie", "New Zealand": "Nouvelle-Zélande",
  "Vietnam": "Vietnam", "Fiji": "Fidji", "Chile": "Chili", "Peru": "Pérou", "Ecuador": "Équateur", "Paraguay": "Paraguay", "Venezuela": "Venezuela",
  "Bolivia": "Bolivie", "Costa Rica": "Costa Rica", "Panama": "Panama", "Jamaica": "Jamaïque", "China": "Chine", "China PR": "Chine",
  "Korea Republic": "Corée du Sud", "Congo DR": "RD Congo", "DR Congo": "RD Congo", "Mali": "Mali", "Burkina Faso": "Burkina Faso",
  "Guinea": "Guinée", "South Africa": "Afrique du Sud", "Cape Verde Islands": "Cap-Vert", "Cape Verde": "Cap-Vert",
};

export function frenchNationName(name) {
  if (!name) return name;
  return FR_NATIONS[name] || FR_NATIONS[String(name).trim()] || name;
}

// Nom d'une sélection, catégorie d'âge comprise : « Spain U21 » → « Espagne U21 ».
// Un nom qui n'est pas exactement celui d'un pays connu (un club : « Paris
// Saint Germain ») reste tel quel, comme les féminines « Belgium W » : le
// suffixe « W » sert à déduire le genre (teamGender, nationalTeamTraits).
export function frenchTeamName(name) {
  const match = String(name ?? "").trim().match(/^(.+?)(?:\s+(U\d{2}))?$/);
  if (!match || !FR_NATIONS[match[1]]) return name;
  return match[2] ? `${FR_NATIONS[match[1]]} ${match[2]}` : FR_NATIONS[match[1]];
}
