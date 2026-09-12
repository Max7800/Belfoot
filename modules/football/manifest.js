// Manifeste (données pures) — le shell lit ça pour la nav + les panneaux admin.
const football = {
  key: "football",
  label: "Football",
  icon: "trophy",
  enabled: true,
  nav: [
    { label: "Matchs", to: "/matchs" },
    { label: "Classement", to: "/classement" },
  ],
  adminPanels: [
    { key: "football-clubs", label: "Clubs" },
    { key: "football-matches", label: "Matchs" },
  ],
};
export default football;
