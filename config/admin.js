// Navigation de l'administration Belfoot.
// Les panneaux restent accessibles par leur URL même lorsqu'ils sont rangés dans « Avancé ».
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
    { key: "playerCareerStats", label: "Carrières et statistiques", secondary: true },
  ] },
  { label: "Sélections belges", icon: "trophy", panels: [
    { key: "nationalteams", label: "Page Diables Rouges" },
    { key: "rankings", label: "Classements Belgique" },
    { key: "nationalCallups", label: "Convocations" },
  ] },
  { label: "Match Center", icon: "activity", panels: [
    { key: "events", label: "Événements" },
    { key: "lineups", label: "Formations" },
    { key: "matchPlayerStats", label: "Performances joueurs" },
  ] },
  { label: "Synchronisation", icon: "refresh", panels: [
    { key: "import-plan", label: "Plan d'import 2026" },
    { key: "jobs", label: "Jobs et historique" },
    { key: "providers", label: "Sources de données" },
    { key: "sync-errors", label: "Erreurs de synchronisation" },
    { key: "system-status", label: "Préparation 2026" },
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
    { key: "votw-sessions", label: "Onze de la semaine" },
    { key: "forum-moderation", label: "Forum" },
    { key: "reports", label: "Signalements" },
  ] },
  { label: "Avancé", icon: "settings", collapsed: true, panels: [
    { key: "media", label: "Médias" },
    { key: "seo", label: "SEO" },
    { key: "io", label: "Import / export" },
    { key: "config", label: "Configuration" },
    { key: "modules", label: "Modules" },
    { key: "flags", label: "Feature flags" },
    { key: "moderation", label: "Modération" },
    { key: "forum", label: "Forum" },
  ] },
];

export const adminPanelIndex = Object.fromEntries(
  adminSections.flatMap((section) => section.panels.map((panel) => [panel.key, { ...panel, section: section.label }])),
);
