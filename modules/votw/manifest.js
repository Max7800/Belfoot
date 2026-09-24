// Activé plus tard (une fois football alimenté). Déclaré ici pour figer le design.
const votw = {
  key: "votw",
  label: "11 de la semaine",
  icon: "star",
  enabled: true, requires: ["football"],
  nav: [{ label: "11 de la semaine", to: "/onze" }],
  adminPanels: [{ key: "votw-sessions", label: "11 de la semaine" }],
  migrations: ["0001_init.sql", "0002_session_competition.sql", "0003_vote_integrity.sql"],
};
export default votw;
