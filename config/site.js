// =============================================================================
//  IDENTITÉ DU SITE — SITE FOOT (fork du socle). À ajuster : nom, domaine, accent.
// =============================================================================
export const siteConfig = {
  name: "Belfoot",
  shortName: "Belfoot",
  // Adresse du site : lib/siteUrl.js (fournie par Vercel, aucun domaine en dur).
  // Le domaine sera pris quand le site sera totalement autonome.
  domain: null,
  // Indexation par les moteurs de recherche : FERMÉE tant que le site n'a pas
  // son domaine (pages « noindex », pas de sitemap annoncé). Passer à true le
  // jour du domaine.
  seo: { indexable: false },
  description: "Actu du foot belge : JPL, D1B, divisions inférieures, Coupe, Belges expatriés et grandes ligues européennes.",
  locale: "fr",

  locales: ["fr", "nl", "en"],     // fr par défaut ; nl/en à brancher plus tard
  defaultLocale: "fr",

  socials: { instagram: "", facebook: "", youtube: "", twitch: "", x: "" },

  nav: [
    { label: "Accueil", to: "/" },
    { label: "Actus", to: "/actus" },
    { label: "Proposer", to: "/proposer" },
    // Matchs / Classement sont fournis automatiquement par le module football.
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
