// Activé plus tard (une fois football alimenté). Déclaré ici pour figer le design.
const votw = {
  key: "votw",
  label: "Onze & avant-match",
  icon: "star",
  enabled: true, requires: ["football"],
  nav: [{ label: "11 de la semaine", to: "/onze" }],
  adminPanels: [{ key: "votw-sessions", label: "Onze & avant-match" }],
  migrations: ["0001_init.sql", "0002_session_competition.sql", "0003_vote_integrity.sql", "0004_pre_match_lineups.sql"],
};
export default votw;
