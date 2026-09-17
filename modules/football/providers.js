// Contrat d'un fournisseur de données football (par compétition / source).
// Aucune implémentation réelle ici : on fige l'INTERFACE, on branchera les vrais
// fournisseurs plus tard (API grosses ligues, CSV divisions inférieures, etc.).
//
//   provider = {
//     key,                       // 'api-foot' | 'csv-belgique-d3' | ...
//     competitions: [...],       // clés/ids de compétitions couvertes
//     async fetchMatches(ctx),   // -> [{ external_id, home, away, score, status, minute, events... }]
//     async fetchStandings(ctx), // optionnel
//     async fetchSquad(ctx),     // optionnel (effectifs)
//     async fetchCurrentCoach(club, ctx), // optionnel (entraîneur actuel)
//   }
//
// Chaque compétition choisit son provider (colonne competitions.provider),
// donc aucune logique "JPL only" : grosses ligues et divisions inférieures
// peuvent avoir des sources différentes.
const PROVIDERS = {};
export function registerProvider(p) { PROVIDERS[p.key] = p; }
export function getProvider(key) { return PROVIDERS[key] || null; }
export function providerFor(competition) { return competition?.provider ? getProvider(competition.provider) : null; }
