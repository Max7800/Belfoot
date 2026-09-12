// Forum autonome — MODULE OPTIONNEL (désactivé par défaut). Réutilise interactions,
// profils et recherche du socle. À activer sur foot/VCH, désactivé sur une vitrine.
const forum = {
  key: "forum", label: "Forum", icon: "messages-square",
  enabled: false, requires: [],
  nav: [{ label: "Forum", to: "/forum" }],
  adminPanels: [{ key: "forum-moderation", label: "Forum (modération)" }],
  migrations: ["0001_init.sql"],
};
export default forum;
