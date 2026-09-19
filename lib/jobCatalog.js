export const JOB_CATALOG = {
  "football.sync": {
    label: "🔄 Synchroniser (import complet)",
    estimate: ({ competitionCount }) => `environ ${Math.max(1, competitionCount) * 3} appels (matchs, clubs, infos ligue)`,
  },
  "football.live-sync": {
    label: "🔴 Direct (scores + événements)",
    estimate: ({ competitionCount, matchCap }) => `jusqu’à ${Math.max(1, competitionCount) + matchCap} appel(s) : journée + événements live`,
  },
  "football.discover-belgians": {
    label: "🔎 Découvrir les Belges",
    estimate: () => "jusqu’à 3 appels par club",
  },
  "football.track-belgians": {
    label: "📊 MAJ Belges suivis",
    estimate: () => "environ 1 appel par joueur suivi",
  },
  "football.squads": {
    label: "👥 Effectifs (joueurs)",
    estimate: () => "jusqu’à 3 appels par club",
  },
  "football.events": {
    label: "⚽ Événements de match",
    estimate: ({ matchCap }) => `jusqu’à ${matchCap} appel(s)`,
  },
  "football.coaches": {
    label: "🧑‍🏫 Entraîneurs",
    estimate: () => "environ 1 appel par club",
  },
  "football.lineups": {
    label: "📋 Compositions & performances",
    estimate: ({ matchCap }) => `jusqu’à ${matchCap * 2} appels`,
  },
  "football.team-test": {
    label: "🧪 Importer l’équipe test",
    estimate: () => "jusqu’à 5 appels",
  },
  "football.national-team": {
    label: "🇧🇪 Synchroniser une sélection",
    estimate: () => "3 appels : fiche équipe, matchs de la saison et effectif actuel",
  },
  "football.find-national-teams": {
    label: "🔎 Trouver les sélections belges",
    estimate: () => "1 appel de recherche, sans écriture sportive",
  },
};

export function jobKeys() {
  return Object.keys(JOB_CATALOG);
}

export function describeJobCost(key, options = {}) {
  const competitionCount = options.competitionId ? 1 : Number(options.competitionCount) || 1;
  const matchCap = Math.max(1, Number(options.matchCap) || 1);
  return JOB_CATALOG[key]?.estimate?.({ ...options, competitionCount, matchCap }) || "coût variable";
}
