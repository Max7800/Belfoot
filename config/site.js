// =============================================================================
//  IDENTITÉ DU SITE — SITE FOOT (fork du socle). À ajuster : nom, domaine, accent.
// =============================================================================
export const siteConfig = {
  name: "Belfoot",
  shortName: "Belfoot",
  domain: "a-definir.be",          // <- domaine à venir
  description: "Actu du foot belge : JPL, D1B, divisions inférieures, Coupe, Belges expatriés et grandes ligues européennes.",
  locale: "fr",

  locales: ["fr", "nl", "en"],     // fr par défaut ; nl/en à brancher plus tard
  defaultLocale: "fr",

  socials: { instagram: "", facebook: "", youtube: "", twitch: "", x: "" },

  nav: [
    { label: "Accueil", to: "/" },
    { label: "Actus", to: "/actus" },
    { label: "Matchs", to: "/matchs" },
    { label: "Classement", to: "/classement" },
  ],

  theme: {
    accent: "#E30613",             // rouge (placeholder) — à ajuster
    defaultMode: "dark",
    allowVisitorSwitch: true,
  },

  auth: { providers: ["google", "discord", "twitch"], email: true },

  flags: { comments: true },

  modules: { auth: true, search: true, contact: true },
};

export default siteConfig;
