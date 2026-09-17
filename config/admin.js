// Structure de l'administration Belfoot (sections + panneaux).
export const adminSections = [
  { label: "Tableau de bord", panels: [{ key: "dashboard", label: "Dashboard" }] },
  { label: "Éditorial", panels: [
    { key: "news", label: "Actualités" },
    { key: "categories", label: "Catégories" },
    { key: "contributions", label: "Contributions" },
  ] },
  { label: "Football", panels: [
    { key: "competitions", label: "Compétitions" },
    { key: "seasons", label: "Saisons" },
    { key: "clubs", label: "Clubs" },
    { key: "players", label: "Joueurs" },
    { key: "coaches", label: "Entraîneurs" },
    { key: "matches", label: "Matchs" },
    { key: "events", label: "Événements" },
  ] },
  { label: "Données & sync", panels: [
    { key: "providers", label: "Providers" },
    { key: "jobs", label: "Jobs" },
    { key: "sync-history", label: "Historique sync" },
    { key: "sync-errors", label: "Erreurs sync" },
  ] },
  { label: "Communauté", panels: [
    { key: "profiles", label: "Profils" },
    { key: "reports", label: "Signalements" },
    { key: "moderation", label: "Modération" },
    { key: "forum", label: "Forum" },
  ] },
  { label: "Réglages", panels: [
    { key: "config", label: "Configuration" },
    { key: "modules", label: "Modules" },
    { key: "flags", label: "Feature flags" },
    { key: "media", label: "Médias" },
    { key: "seo", label: "SEO" },
    { key: "labels", label: "Textes" },
    { key: "tilesbg", label: "Tuiles" },
    { key: "clubpage", label: "Fiche club" },
    { key: "statspage", label: "Page Stats" },
    { key: "io", label: "Import / export" },
  ] },
];
