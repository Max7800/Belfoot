// Catalogue des jobs : label + estimation de coût + GROUPE + dépendances.
// Les groupes rangent l'admin ; `requires` = jobs à lancer avant (indicatif) ;
// les pipelines enchaînent plusieurs jobs dans le bon ordre, budget partagé.

export const JOB_GROUPS = {
  base: { label: "Import de base", order: 0 },
  belges: { label: "Belges & sélections", order: 1 },
  direct: { label: "Direct", order: 2 },
};

export const JOB_CATALOG = {
  "football.sync": {
    label: "🔄 Synchroniser (import complet)", group: "base", target: "competition",
    requiresMigrations: [{ module: "football", version: "0023_season_safe_sync" }],
    estimate: ({ competitionCount }) => `environ ${Math.max(1, competitionCount) * 4} appels (matchs, clubs, infos ligue, classements)`,
  },
  "football.squads": {
    label: "👥 Effectifs (joueurs)", group: "base", target: "competition", requires: ["football.sync"],
    requiresMigrations: [{ module: "football", version: "0024_player_team_seasons" }],
    estimate: () => "jusqu’à 4 appels par club pour la saison actuelle",
  },
  "football.events": {
    label: "⚽ Événements de match", group: "base", target: "competition", requires: ["football.sync"],
    requiresMigrations: [{ module: "football", version: "0034_match_sync_state" }],
    estimate: ({ matchCap }) => `jusqu’à ${matchCap} appel(s)`,
  },
  "football.coaches": {
    label: "🧑‍🏫 Entraîneurs", group: "base", target: "competition", requires: ["football.sync"],
    estimate: () => "environ 1 appel par club",
  },
  "football.transfers": {
    label: "🔁 Transferts & mercato", group: "base", target: "competition", requires: ["football.sync"],
    requiresMigrations: [{ module: "football", version: "0037_player_transfers" }],
    estimate: () => "1 appel par club, avec reprise par lots",
  },
  "football.lineups": {
    label: "📋 Compositions & statistiques", group: "base", target: "competition", requires: ["football.sync"],
    requiresMigrations: [
      { module: "football", version: "0033_history_foundations" },
      { module: "football", version: "0034_match_sync_state" },
      { module: "football", version: "0035_match_team_stats" },
    ],
    estimate: ({ matchCap }) => `jusqu’à ${matchCap * 3} appels`,
  },
  "football.team-test": {
    label: "🧪 Importer l’équipe test", group: "base", target: "competition",
    requiresMigrations: [{ module: "football", version: "0024_player_team_seasons" }],
    estimate: () => "jusqu’à 5 appels",
  },
  "football.discover-belgians": {
    label: "🔎 Découvrir les Belges", group: "belges", target: "competition",
    requiresMigrations: [{ module: "football", version: "0024_player_team_seasons" }],
    estimate: () => "jusqu’à 3 appels par club",
  },
  "football.track-belgians": {
    label: "📊 MAJ Belges suivis", group: "belges", target: "competition", requires: ["football.discover-belgians"],
    requiresMigrations: [{ module: "football", version: "0024_player_team_seasons" }],
    estimate: () => "environ 1 appel par joueur suivi",
  },
  "football.player-careers": {
    label: "🧭 Historiques de carrière", group: "belges", target: "competition", requires: ["football.discover-belgians"],
    requiresMigrations: [{ module: "football", version: "0033_history_foundations" }],
    estimate: ({ batchSize }) => `jusqu’à ${batchSize || 5} appel(s), un par joueur du lot`,
  },
  "football.find-national-teams": {
    label: "🔎 Trouver les sélections belges", group: "belges",
    requiresMigrations: [{ module: "football", version: "0028_followed_national_teams" }],
    estimate: () => "1 appel de recherche, sans écriture sportive",
  },
  "football.national-team": {
    label: "🇧🇪 Synchroniser une sélection", group: "belges", target: "national",
    requiresMigrations: [{ module: "football", version: "0028_followed_national_teams" }, { module: "football", version: "0036_competition_scope" }, { module: "football", version: "0038_player_national_team" }],
    estimate: () => "3 appels : fiche équipe, matchs de la saison et effectif actuel",
  },
  "football.resolve-national-clubs": {
    label: "🌍 Compléter les clubs des internationaux", group: "belges", target: "national", requires: ["football.national-team"],
    requiresMigrations: [{ module: "football", version: "0028_followed_national_teams" }],
    estimate: ({ matchCap }) => `jusqu’à ${matchCap} appel(s), un par joueur sans club`,
  },
  "football.live-sync": {
    label: "🔴 Direct (scores + événements)", group: "direct",
    requiresMigrations: [
      { module: "football", version: "0026_match_center_live" },
      { module: "football", version: "0034_match_sync_state" },
    ],
    estimate: ({ competitionCount, matchCap }) => `jusqu’à ${Math.max(1, competitionCount) + matchCap} appel(s) : journée + événements live`,
  },
};

// Pipelines : séquences ordonnées lancées en un clic (budget partagé, stop si erreur).
export const JOB_PIPELINES = [
  { key: "weekly", label: "🗓️ MAJ hebdomadaire", jobs: ["football.sync", "football.lineups", "football.track-belgians"], description: "Résultats + compos + statistiques + Belges suivis." },
  { key: "matchday", label: "📅 Préparer une journée", jobs: ["football.sync", "football.lineups"], description: "Résultats, compositions et statistiques des matchs plafonnés." },
  { key: "setup", label: "🏗️ Mise en place saison", jobs: ["football.sync", "football.squads", "football.coaches"], description: "Import de base : matchs, effectifs, entraîneurs." },
  {
    key: "complete-season",
    label: "✅ Compléter la saison",
    jobs: ["football.events", "football.lineups"],
    description: "Événements, compositions et statistiques de tous les matchs terminés encore incomplets.",
    drainJobs: ["football.events", "football.lineups"],
    batchCaps: { "football.events": 15, "football.lineups": 3 },
    allowPartialBudget: true,
  },
  {
    key: "transfers",
    label: "🔁 Mettre à jour le mercato",
    jobs: ["football.transfers"],
    description: "Transferts de la saison et correction des arrivées/départs dans les effectifs.",
    drainJobs: ["football.transfers"],
  },
];

export function jobKeys() {
  return Object.keys(JOB_CATALOG);
}

export function jobsInGroup(group) {
  return jobKeys().filter((k) => (JOB_CATALOG[k]?.group || "base") === group);
}

export function jobPipelines() {
  return JOB_PIPELINES;
}

export function describeJobCost(key, options = {}) {
  const competitionCount = options.competitionId ? 1 : Number(options.competitionCount) || 1;
  const matchCap = Math.max(1, Number(options.matchCap) || 1);
  return JOB_CATALOG[key]?.estimate?.({ ...options, competitionCount, matchCap }) || "coût variable";
}
