// Activé plus tard (une fois football alimenté). Déclaré ici pour figer le design.
const votw = {
  key: "votw",
  label: "11 de la semaine",
  icon: "star",
  enabled: true, requires: ["football"],
  nav: [{ label: "11 de la semaine", to: "/onze" }],
  adminPanels: [{ key: "votw-sessions", label: "11 de la semaine" }],
};
export default votw;
