import { sectionMetadata } from "@/lib/seo";

// Section : couvre aussi les sous-pages (sujets du forum, /diables-rouges/matchs…),
// d'où l'absence d'adresse canonique (lib/seo.js, sectionMetadata).

export const metadata = sectionMetadata({ title: "Le Noyau", description: "Le forum de Belfoot : débats sur le foot belge, les Diables et les Belges à l’étranger." });

export default function Layout({ children }) {
  return children;
}
