import { sectionMetadata } from "@/lib/seo";

// Section : couvre aussi les sous-pages (sujets du forum, /diables-rouges/matchs…),
// d'où l'absence d'adresse canonique (lib/seo.js, sectionMetadata).

export const metadata = sectionMetadata({ title: "Le 11 de la semaine", description: "Compose et partage ton onze, vote pour l’équipe de la semaine." });

export default function Layout({ children }) {
  return children;
}
