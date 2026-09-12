// Football Manager — VERTICALE STRUCTURÉE (module optionnel, désactivé).
// Pas une catégorie de forum : des fiches structurées réutilisant collections +
// médias + downloads + interactions (fil de discussion associé).
// Sous-sections prévues : tactiques, carrières/saves, pépites/joueurs, défis,
// mods/databases, téléchargements. À implémenter le moment venu.
const fm = {
  key: "fm", label: "Football Manager", icon: "gamepad-2",
  enabled: false, requires: [],
  nav: [{ label: "FM", to: "/fm" }],
  adminPanels: [{ key: "fm-sheets", label: "FM — fiches" }],
};
export default fm;
