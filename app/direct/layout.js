import { sectionMetadata } from "@/lib/seo";

// Section : couvre aussi les sous-pages (sujets du forum, /diables-rouges/matchs…),
// d'où l'absence d'adresse canonique (lib/seo.js, sectionMetadata).

export const metadata = sectionMetadata({ title: "Scores en direct", description: "Les scores en direct des matchs suivis par Belfoot." });

export default function Layout({ children }) {
  return children;
}
