// Taxonomie UNIQUE des portées de compétition (competition_scope), partagée par le
// sélecteur de synchronisation (components/admin/panels.js) ET le plan d'import
// (components/admin/ImportPlanPanel.js) pour qu'ils ne divergent plus jamais.
//
// 4 portées canoniques :
//   belgique      → compétitions belges de clubs (Pro League, Challenger, Croky Cup)
//   europe        → coupes d'Europe de clubs (Champions/Europa/Conference League)
//   etranger      → championnats étrangers où évoluent des Belges (rangés PAR PAYS)
//   international → sélections nationales + Nations League / Euro / Coupe du monde
//
// Historique : la migration 0036 avait donné « national » comme défaut à TOUTES les
// compétitions ; les championnats étrangers s'y étaient donc glissés. resolveCompetitionScope
// répare ça à l'affichage (via le pays) même avant que la migration 0039 ne normalise la base.

export const COMPETITION_SCOPES = [
  { key: "belgique", label: "Belgique", icon: "🇧🇪", description: "Pro League, Challenger Pro League, Croky Cup et autres compétitions belges." },
  { key: "europe", label: "Europe", icon: "🇪🇺", description: "Champions League, Europa League et Conference League." },
  { key: "etranger", label: "Étranger", icon: "🌍", byCountry: true, description: "Championnats étrangers où évoluent des Belges, rangés par pays." },
  { key: "international", label: "Sélections", icon: "🏳️", description: "Sélections nationales suivies + Nations League, Euro et Coupe du monde." },
];

export const COMPETITION_SCOPE_KEYS = COMPETITION_SCOPES.map((scope) => scope.key);
export const COMPETITION_SCOPE_BY_KEY = Object.fromEntries(COMPETITION_SCOPES.map((scope) => [scope.key, scope]));

const isBelgianCountry = (country) => /belg/i.test(String(country || ""));

// Portée canonique d'une compétition, robuste aux valeurs héritées / nulles.
export function resolveCompetitionScope(competition) {
  const raw = competition?.competition_scope;
  if (raw === "europe" || raw === "etranger" || raw === "international" || raw === "belgique") return raw;
  // « national » (ancien défaut) ou valeur absente : on distingue le belge de
  // l'étranger grâce au pays renvoyé par l'API. Pays connu ≠ Belgique ⇒ étranger.
  const country = competition?.ext?.country;
  if (country && !isBelgianCountry(country)) return "etranger";
  return "belgique";
}

// Libellé de pays pour le sous-regroupement de la catégorie « Étranger ».
export function competitionCountry(competition) {
  const country = String(competition?.ext?.country || "").trim();
  return country || "Autre pays";
}

// Compétitions regroupées par portée puis, pour l'étranger, par pays.
// Retour : { belgique: [...], europe: [...], etranger: { "Angleterre": [...] }, international: [...] }
export function groupCompetitionsByScope(competitions = [], sort) {
  const buckets = { belgique: [], europe: [], etranger: {}, international: [] };
  for (const competition of competitions) {
    const scope = resolveCompetitionScope(competition);
    if (scope === "etranger") {
      const country = competitionCountry(competition);
      (buckets.etranger[country] ||= []).push(competition);
    } else {
      buckets[scope].push(competition);
    }
  }
  if (sort) {
    buckets.belgique.sort(sort);
    buckets.europe.sort(sort);
    buckets.international.sort(sort);
    for (const country of Object.keys(buckets.etranger)) buckets.etranger[country].sort(sort);
  }
  return buckets;
}
