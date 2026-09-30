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
  "Uruguay": "Uruguay", "Australia": "Australie", "Iran": "Iran", "Ivory Coast": "Côte d'Ivoire", "Saudi Arabia": "Arabie saoudite",
  "Canada": "Canada", "Nigeria": "Nigéria", "Egypt": "Égypte", "Cameroon": "Cameroun", "Ghana": "Ghana", "Qatar": "Qatar",
};

export function frenchNationName(name) {
  if (!name) return name;
  return FR_NATIONS[name] || FR_NATIONS[String(name).trim()] || name;
}
