import { sectionMetadata } from "@/lib/seo";

// Section : couvre aussi les sous-pages (sujets du forum, /diables-rouges/matchs…),
// d'où l'absence d'adresse canonique (lib/seo.js, sectionMetadata).

export const metadata = sectionMetadata({ title: "Compétitions", description: "Pro League, Challenger, Croky Cup, coupes d’Europe et sélections : classements, calendriers et résultats." });

export default function Layout({ children }) {
  return children;
}
