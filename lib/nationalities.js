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
  })).map((country) => ({ ...country, flag: flag(country.code) }));
  if (matches.length) return matches;
  const original = rawValues.filter(Boolean).join(", ");
  return [{ code: "", label: original, flag: "🌍" }];
}

export function ratingTone(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return "bg-white/[0.06] text-muted";
  if (rating >= 7) return "bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/25";
  if (rating >= 6) return "bg-amber-300/20 text-amber-200 ring-1 ring-amber-300/25";
  return "bg-red-400/20 text-red-300 ring-1 ring-red-400/25";
}
