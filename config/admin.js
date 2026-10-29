// Navigation de l'administration Belfoot.
// Section « Avancé » retirée le 30/10/2026 : Médias, SEO, Import / export, Modération
// et Forum ouvraient une page vide, Configuration, Modules et Feature flags un JSON en
// lecture seule (la configuration se modifie dans config/site.js).
export const adminSections = [
  { label: "Accueil", icon: "home", panels: [{ key: "dashboard", label: "Vue d'ensemble" }] },
  { label: "Contenu", icon: "editorial", panels: [
    { key: "news", label: "Actualités" },
    { key: "mercato", label: "Mercato" },
    { key: "scouting", label: "Scouting" },
    { key: "categories", label: "Catégories" },
    { key: "contributions", label: "Contributions" },
    { key: "correction", label: "Corrections" },
    { key: "propose", label: "Page Proposer" },
  ] },
  { label: "Compétitions", icon: "trophy", panels: [
    { key: "competitions", label: "Compétitions" },
    { key: "seasons", label: "Saisons et phases" },
    { key: "matches", label: "Matchs" },
  ] },
  { label: "Clubs & effectifs", icon: "users", panels: [
    { key: "clubs", label: "Clubs" },
    { key: "players", label: "Joueurs" },
    { key: "coaches", label: "Entraîneurs" },
    { key: "playerMemberships", label: "Affectations", secondary: true },
    { key: "playerTransfers", label: "Transferts", secondary: true },
    { key: "playerCareerStats", label: "Carrières et statistiques", secondary: true },
  ] },
  { label: "Sélections belges", icon: "trophy", panels: [
    { key: "nationalteams", label: "Page Diables Rouges" },
    { key: "rankings", label: "Classements Belgique" },
    { key: "nationalCallups", label: "Convocations" },
    { key: "nationalMatchCallups", label: "Convocations par match" },
  ] },
  { label: "Match Center", icon: "activity", panels: [
    { key: "events", label: "Événements" },
    { key: "lineups", label: "Formations" },
    { key: "matchPlayerStats", label: "Performances joueurs" },
  ] },
  // Rangé le 30/10/2026 : l'utile d'abord, les pages de lecture et de réglage en retrait.
  { label: "Synchronisation", icon: "refresh", panels: [
    { key: "jobs", label: "Synchronisations" },
    { key: "sync-history", label: "Historique" },
    { key: "import-plan", label: "Plan d'import" },
    { key: "season-activation", label: "Saisons (activation)" },
    { key: "data-maintenance", label: "Entretien des données" },
    { key: "sync-overview", label: "État détaillé (lecture seule)", secondary: true },
    { key: "system-status", label: "Fiabilité des données", secondary: true },
    { key: "live-strategy", label: "Stratégie du direct", secondary: true },
    { key: "providers", label: "Sources de données", secondary: true },
  ] },
  { label: "Apparence du site", icon: "palette", panels: [
    { key: "homepage", label: "Page d'accueil" },
    { key: "competitionhub", label: "Portail compétitions" },
    { key: "belgiansabroad", label: "Belges à l'étranger" },
    { key: "clubpage", label: "Fiches clubs" },
    { key: "statspage", label: "Pages statistiques" },
    { key: "tilesbg", label: "Tuiles et couleurs" },
    { key: "labels", label: "Textes de l'interface" },
  ] },
  { label: "Communauté", icon: "community", panels: [
    { key: "profiles", label: "Profils" },
    { key: "votw-sessions", label: "Onze & avant-match" },
    { key: "forum-moderation", label: "Forum" },
    { key: "reports", label: "Signalements" },
  ] },
];

export const adminPanelIndex = Object.fromEntries(
  adminSections.flatMap((section) => section.panels.map((panel) => [panel.key, { ...panel, section: section.label }])),
);
