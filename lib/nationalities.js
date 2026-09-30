const COUNTRY_ALIASES = [
  { code: "BE", label: "Belgique", aliases: ["belgique", "belgium", "belge", "belgian", "belgo"] },
  { code: "MA", label: "Maroc", aliases: ["maroc", "morocco", "marocain", "marocaine", "moroccan"] },
  { code: "FR", label: "France", aliases: ["france", "francais", "francaise", "french"] },
  { code: "NL", label: "Pays-Bas", aliases: ["pays bas", "netherlands", "neerlandais", "neerlandaise", "dutch"] },
  { code: "DE", label: "Allemagne", aliases: ["allemagne", "germany", "allemand", "allemande", "german"] },
  { code: "ES", label: "Espagne", aliases: ["espagne", "spain", "espagnol", "espagnole", "spanish"] },
  { code: "IT", label: "Italie", aliases: ["italie", "italy", "italien", "italienne", "italian"] },
  { code: "PT", label: "Portugal", aliases: ["portugal", "portugais", "portugaise", "portuguese"] },
  { code: "GB", label: "Royaume-Uni", aliases: ["royaume uni", "united kingdom", "britannique", "british"] },
  { code: "GB", label: "Angleterre", aliases: ["angleterre", "england", "anglais", "anglaise", "english"] },
  { code: "TR", label: "Turquie", aliases: ["turquie", "turkiye", "turkey", "turc", "turque", "turkish"] },
  { code: "CD", label: "RD Congo", aliases: ["rd congo", "dr congo", "congo kinshasa", "congolais", "congolaise"] },
  { code: "CG", label: "Congo", aliases: ["congo brazzaville"] },
  { code: "DZ", label: "Algérie", aliases: ["algerie", "algeria", "algerien", "algerienne", "algerian"] },
  { code: "TN", label: "Tunisie", aliases: ["tunisie", "tunisia", "tunisien", "tunisienne", "tunisian"] },
  { code: "SN", label: "Sénégal", aliases: ["senegal", "senegalais", "senegalaise"] },
  { code: "GH", label: "Ghana", aliases: ["ghana", "ghaneen", "ghaneenne", "ghanaian"] },
  { code: "CI", label: "Côte d’Ivoire", aliases: ["cote d ivoire", "ivoirien", "ivoirienne", "ivorian"] },
  { code: "CM", label: "Cameroun", aliases: ["cameroun", "cameroon", "camerounais", "camerounaise"] },
  { code: "NG", label: "Nigeria", aliases: ["nigeria", "nigerian", "nigeriane"] },
  { code: "US", label: "États-Unis", aliases: ["etats unis", "united states", "usa", "americain", "americaine"] },
  { code: "CA", label: "Canada", aliases: ["canada", "canadien", "canadienne", "canadian"] },
  { code: "BR", label: "Brésil", aliases: ["bresil", "brazil", "bresilien", "bresilienne", "brazilian"] },
  { code: "AR", label: "Argentine", aliases: ["argentine", "argentina", "argentin", "argentinian"] },
  { code: "CO", label: "Colombie", aliases: ["colombie", "colombia", "colombien", "colombian"] },
  { code: "UY", label: "Uruguay", aliases: ["uruguay", "uruguayen", "uruguayan"] },
  { code: "JP", label: "Japon", aliases: ["japon", "japan", "japonais", "japanese"] },
  { code: "KR", label: "Corée du Sud", aliases: ["coree du sud", "south korea", "korean"] },
  { code: "SE", label: "Suède", aliases: ["suede", "sweden", "suedois", "swedish"] },
  { code: "NO", label: "Norvège", aliases: ["norvege", "norway", "norvegien", "norwegian"] },
  { code: "DK", label: "Danemark", aliases: ["danemark", "denmark", "danois", "danish"] },
  { code: "IS", label: "Islande", aliases: ["islande", "iceland", "islandais", "icelandic"] },
  { code: "CH", label: "Suisse", aliases: ["suisse", "switzerland", "swiss"] },
  { code: "AT", label: "Autriche", aliases: ["autriche", "austria", "autrichien", "austrian"] },
  { code: "HR", label: "Croatie", aliases: ["croatie", "croatia", "croate", "croatian"] },
  { code: "RS", label: "Serbie", aliases: ["serbie", "serbia", "serbe", "serbian"] },
  { code: "BA", label: "Bosnie-Herzégovine", aliases: ["bosnie herzegovine", "bosnia and herzegovina", "bosnian"] },
  { code: "AL", label: "Albanie", aliases: ["albanie", "albania", "albanais", "albanian"] },
  { code: "XK", label: "Kosovo", aliases: ["kosovo", "kosovar"] },
  { code: "PL", label: "Pologne", aliases: ["pologne", "poland", "polonais", "polish"] },
  { code: "CZ", label: "Tchéquie", aliases: ["tchequie", "czech republic", "czechia", "czech"] },
  { code: "SK", label: "Slovaquie", aliases: ["slovaquie", "slovakia", "slovaque", "slovak"] },
  { code: "SI", label: "Slovénie", aliases: ["slovenie", "slovenia", "slovene", "slovenian"] },
  { code: "RO", label: "Roumanie", aliases: ["roumanie", "romania", "roumain", "romanian"] },
  { code: "GR", label: "Grèce", aliases: ["grece", "greece", "grec", "greek"] },
  { code: "UA", label: "Ukraine", aliases: ["ukraine", "ukrainien", "ukrainian"] },
  { code: "IL", label: "Israël", aliases: ["israel", "israelien", "israeli"] },
  { code: "AU", label: "Australie", aliases: ["australie", "australia", "australien", "australian"] },
  { code: "ZA", label: "Afrique du Sud", aliases: ["afrique du sud", "south africa", "sud africain", "south african"] },
  { code: "ML", label: "Mali", aliases: ["mali", "malien", "malian"] },
  { code: "GN", label: "Guinée", aliases: ["guinee", "guinea", "guineen", "guinean"] },
  { code: "GM", label: "Gambie", aliases: ["gambie", "gambia", "gambien", "gambian"] },
  { code: "BF", label: "Burkina Faso", aliases: ["burkina faso", "burkinabe"] },
  { code: "CV", label: "Cap-Vert", aliases: ["cap vert", "cape verde", "capverdien"] },
  { code: "AO", label: "Angola", aliases: ["angola", "angolais", "angolan"] },
  { code: "EG", label: "Égypte", aliases: ["egypte", "egypt", "egyptien", "egyptian"] },
];

const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const flag = (code) => code.length === 2 ? String.fromCodePoint(...code.toUpperCase().split("").map((letter) => 127397 + letter.charCodeAt(0))) : "🌍";

// Catalogue éditorial volontairement plus large que les sélections déjà
// importées dans Belfoot. Il couvre largement le top 75 FIFA et les principales
// doubles nationalités rencontrées en Belgique.
const NATIONAL_TEAM_ROWS = [
  ["AR", "Argentine"], ["FR", "France"], ["ES", "Espagne"], ["GB-ENG", "Angleterre"], ["BR", "Brésil"],
  ["PT", "Portugal"], ["NL", "Pays-Bas"], ["BE", "Belgique"], ["DE", "Allemagne"], ["HR", "Croatie"],
  ["IT", "Italie"], ["MA", "Maroc"], ["CO", "Colombie"], ["MX", "Mexique"], ["UY", "Uruguay"],
  ["US", "États-Unis"], ["CH", "Suisse"], ["JP", "Japon"], ["SN", "Sénégal"], ["IR", "Iran"],
  ["DK", "Danemark"], ["AT", "Autriche"], ["KR", "Corée du Sud"], ["AU", "Australie"], ["UA", "Ukraine"],
  ["TR", "Turquie"], ["EC", "Équateur"], ["SE", "Suède"], ["PL", "Pologne"], ["CA", "Canada"],
  ["RS", "Serbie"], ["RU", "Russie"], ["EG", "Égypte"], ["PA", "Panama"], ["NO", "Norvège"],
  ["DZ", "Algérie"], ["HU", "Hongrie"], ["CZ", "Tchéquie"], ["CI", "Côte d’Ivoire"], ["NG", "Nigeria"],
  ["RO", "Roumanie"], ["GR", "Grèce"], ["TN", "Tunisie"], ["CM", "Cameroun"], ["SK", "Slovaquie"],
  ["CR", "Costa Rica"], ["QA", "Qatar"], ["VE", "Venezuela"], ["ML", "Mali"], ["PY", "Paraguay"],
  ["SI", "Slovénie"], ["PE", "Pérou"], ["CL", "Chili"], ["ZA", "Afrique du Sud"], ["SA", "Arabie saoudite"],
  ["IQ", "Irak"], ["CD", "RD Congo"], ["UZ", "Ouzbékistan"], ["BF", "Burkina Faso"], ["IE", "Irlande"],
  ["AL", "Albanie"], ["JO", "Jordanie"], ["GE", "Géorgie"], ["IS", "Islande"], ["FI", "Finlande"],
  ["JM", "Jamaïque"], ["GH", "Ghana"], ["BA", "Bosnie-Herzégovine"], ["MK", "Macédoine du Nord"], ["ME", "Monténégro"],
  ["AE", "Émirats arabes unis"], ["CV", "Cap-Vert"], ["GB-SCT", "Écosse"], ["GB-WLS", "Pays de Galles"], ["GB-NIR", "Irlande du Nord"],
  ["IL", "Israël"], ["HN", "Honduras"], ["BO", "Bolivie"], ["SY", "Syrie"], ["OM", "Oman"],
  ["GN", "Guinée"], ["GA", "Gabon"], ["HT", "Haïti"], ["CW", "Curaçao"], ["TT", "Trinité-et-Tobago"],
  ["ZM", "Zambie"], ["UG", "Ouganda"], ["AO", "Angola"], ["BJ", "Bénin"], ["GQ", "Guinée équatoriale"],
  ["KE", "Kenya"], ["TZ", "Tanzanie"], ["ZW", "Zimbabwe"], ["MZ", "Mozambique"], ["CG", "Congo"],
  ["XK", "Kosovo"], ["AM", "Arménie"], ["AZ", "Azerbaïdjan"], ["BY", "Biélorussie"], ["BG", "Bulgarie"],
  ["CY", "Chypre"], ["EE", "Estonie"], ["LV", "Lettonie"], ["LT", "Lituanie"], ["LU", "Luxembourg"],
  ["MD", "Moldavie"], ["KZ", "Kazakhstan"], ["NZ", "Nouvelle-Zélande"], ["CN", "Chine"], ["IN", "Inde"],
  ["ID", "Indonésie"], ["TH", "Thaïlande"], ["VN", "Vietnam"], ["MY", "Malaisie"], ["PH", "Philippines"],
  ["LB", "Liban"], ["PS", "Palestine"], ["DO", "République dominicaine"], ["SV", "Salvador"], ["GT", "Guatemala"],
  ["NI", "Nicaragua"], ["CU", "Cuba"], ["SR", "Suriname"], ["GY", "Guyana"], ["LY", "Libye"],
  ["SD", "Soudan"], ["MR", "Mauritanie"], ["GM", "Gambie"], ["SL", "Sierra Leone"], ["TG", "Togo"],
  ["RW", "Rwanda"], ["BI", "Burundi"], ["ET", "Éthiopie"], ["MG", "Madagascar"], ["KM", "Comores"],
];

export const NATIONAL_TEAM_CATALOG = NATIONAL_TEAM_ROWS.map(([code, name]) => ({
  code,
  name,
  flag: flag(code.slice(-2)),
  flagUrl: code.includes("-") ? null : `https://flagcdn.com/24x18/${code.toLowerCase()}.png`,
})).sort((a, b) => a.name.localeCompare(b.name, "fr"));

export function nationalityBadges(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  const normalized = normalize(rawValues.filter(Boolean).join(" "));
  if (!normalized) return [];
  const matches = COUNTRY_ALIASES.filter((country) => country.aliases.some((alias) => {
    const token = normalize(alias);
    return (` ${normalized} `).includes(` ${token} `);
  })).map((country) => ({ ...country, flag: flag(country.code), flagUrl: `https://flagcdn.com/24x18/${country.code.toLowerCase()}.png` }));
  if (matches.length) return matches;
  const original = rawValues.filter(Boolean).join(", ");
  return [{ code: "", label: original, flag: "🌍", flagUrl: null }];
}

export function ratingTone(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return "bg-white/[0.06] text-muted";
  if (rating >= 7) return "bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/25";
  if (rating >= 6) return "bg-amber-300/20 text-amber-200 ring-1 ring-amber-300/25";
  return "bg-red-400/20 text-red-300 ring-1 ring-red-400/25";
}
