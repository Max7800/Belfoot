// Forum autonome — MODULE OPTIONNEL (désactivé par défaut). Réutilise interactions,
// profils et recherche du socle. À activer sur foot/VCH, désactivé sur une vitrine.
const forum = {
  key: "forum", label: "Forum", icon: "messages-square",
  enabled: true, requires: [],
  nav: [{ label: "Le Noyau", to: "/forum" }],
  adminPanels: [{ key: "forum-moderation", label: "Forum (modération)" }],
  migrations: ["0001_init.sql", "0002_noyau_structure.sql", "0003_community_guardrails.sql"],
};
export default forum;
