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
