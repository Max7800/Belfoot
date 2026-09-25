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
    label: "🔄 Synchroniser (import complet)", group: "base",
    estimate: ({ competitionCount }) => `environ ${Math.max(1, competitionCount) * 3} appels (matchs, clubs, infos ligue)`,
  },
  "football.squads": {
    label: "👥 Effectifs (joueurs)", group: "base", requires: ["football.sync"], requiresMigration: "0024_player_team_seasons",
    estimate: () => "jusqu’à 3 appels par club",
  },
  "football.events": {
    label: "⚽ Événements de match", group: "base", requires: ["football.sync"],
    estimate: ({ matchCap }) => `jusqu’à ${matchCap} appel(s)`,
  },
  "football.coaches": {
    label: "🧑‍🏫 Entraîneurs", group: "base", requires: ["football.sync"],
    estimate: () => "environ 1 appel par club",
  },
  "football.lineups": {
    label: "📋 Compositions & performances", group: "base", requires: ["football.sync"],
    estimate: ({ matchCap }) => `jusqu’à ${matchCap * 2} appels`,
  },
  "football.team-test": {
    label: "🧪 Importer l’équipe test", group: "base",
    estimate: () => "jusqu’à 5 appels",
  },
  "football.discover-belgians": {
    label: "🔎 Découvrir les Belges", group: "belges",
    estimate: () => "jusqu’à 3 appels par club",
  },
  "football.track-belgians": {
    label: "📊 MAJ Belges suivis", group: "belges", requires: ["football.discover-belgians"],
    estimate: () => "environ 1 appel par joueur suivi",
  },
  "football.find-national-teams": {
    label: "🔎 Trouver les sélections belges", group: "belges", requiresMigration: "0028_followed_national_teams",
    estimate: () => "1 appel de recherche, sans écriture sportive",
  },
  "football.national-team": {
    label: "🇧🇪 Synchroniser une sélection", group: "belges", requiresMigration: "0028_followed_national_teams",
    estimate: () => "3 appels : fiche équipe, matchs de la saison et effectif actuel",
  },
  "football.resolve-national-clubs": {
    label: "🌍 Compléter les clubs des internationaux", group: "belges", requires: ["football.national-team"], requiresMigration: "0028_followed_national_teams",
    estimate: ({ matchCap }) => `jusqu’à ${matchCap} appel(s), un par joueur sans club`,
  },
  "football.live-sync": {
    label: "🔴 Direct (scores + événements)", group: "direct", requiresMigration: "0026_match_center_live",
    estimate: ({ competitionCount, matchCap }) => `jusqu’à ${Math.max(1, competitionCount) + matchCap} appel(s) : journée + événements live`,
  },
};

// Pipelines : séquences ordonnées lancées en un clic (budget partagé, stop si erreur).
export const JOB_PIPELINES = [
  { key: "weekly", label: "🗓️ MAJ hebdomadaire", jobs: ["football.sync", "football.lineups", "football.track-belgians"], description: "Résultats de la semaine + compos + Belges suivis." },
  { key: "matchday", label: "📅 Préparer une journée", jobs: ["football.sync", "football.lineups"], description: "Résultats + compositions (pour le 11 de la semaine, les notes…)." },
  { key: "setup", label: "🏗️ Mise en place saison", jobs: ["football.sync", "football.squads", "football.coaches"], description: "Import de base : matchs, effectifs, entraîneurs." },
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
