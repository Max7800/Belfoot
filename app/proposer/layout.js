import { sectionMetadata } from "@/lib/seo";

// Section : couvre aussi les sous-pages (sujets du forum, /diables-rouges/matchs…),
// d'où l'absence d'adresse canonique (lib/seo.js, sectionMetadata).

export const metadata = sectionMetadata({ title: "Proposer", description: "Proposer une information, un article ou une correction à la rédaction de Belfoot." });

export default function Layout({ children }) {
  return children;
}
