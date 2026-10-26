import { publicServerClient } from "@/lib/publicServerClient";
import { loadCompetitionMetadata } from "@/lib/pageMetadataLoaders";

// Titre d'onglet et aperçu de partage de la page (la page elle-même est rendue côté navigateur).
export async function generateMetadata({ params }) {
  const { slug } = await params;
  return loadCompetitionMetadata(publicServerClient(), slug);
}

export default function Layout({ children }) {
  return children;
}
