import { publicServerClient } from "@/lib/publicServerClient";
import { loadMatchMetadata } from "@/lib/pageMetadataLoaders";

// Titre d'onglet et aperçu de partage de la page (la page elle-même est rendue côté navigateur).
export async function generateMetadata({ params }) {
  const { id } = await params;
  return loadMatchMetadata(publicServerClient(), id);
}

export default function Layout({ children }) {
  return children;
}
