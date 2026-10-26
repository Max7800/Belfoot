import { sectionMetadata } from "@/lib/seo";

// Section : couvre aussi les sous-pages (sujets du forum, /diables-rouges/matchs…),
// d'où l'absence d'adresse canonique (lib/seo.js, sectionMetadata).

export const metadata = sectionMetadata({ title: "Diables Rouges", description: "Calendrier, résultats, sélection et classement FIFA des Diables Rouges et des sélections de jeunes." });

export default function Layout({ children }) {
  return children;
}
