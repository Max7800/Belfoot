// Rendu public du HTML produit par l'éditeur riche (contenu admin, de confiance).
export default function RichContent({ html }) {
  if (!html) return null;
  return <div className="rich" dangerouslySetInnerHTML={{ __html: html }} />;
}
