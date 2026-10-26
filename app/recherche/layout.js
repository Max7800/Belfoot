import { sectionMetadata } from "@/lib/seo";

// Section : couvre aussi les sous-pages (sujets du forum, /diables-rouges/matchs…),
// d'où l'absence d'adresse canonique (lib/seo.js, sectionMetadata).

export const metadata = sectionMetadata({ title: "Recherche", description: "Rechercher une compétition, un club, un joueur ou un article sur Belfoot." });

export default function Layout({ children }) {
  return children;
}
