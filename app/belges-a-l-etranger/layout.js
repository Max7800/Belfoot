import { sectionMetadata } from "@/lib/seo";

// Section : couvre aussi les sous-pages (sujets du forum, /diables-rouges/matchs…),
// d'où l'absence d'adresse canonique (lib/seo.js, sectionMetadata).

export const metadata = sectionMetadata({ title: "Belges à l’étranger", description: "Les joueurs belges qui évoluent hors de Belgique : clubs, rendez-vous et performances." });

export default function Layout({ children }) {
  return children;
}
