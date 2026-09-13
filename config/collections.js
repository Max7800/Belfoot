// =============================================================================
//  COLLECTIONS — le cœur réutilisable du moteur.
//
//  Chaque entrée déclare un type de contenu. À partir de cette déclaration,
//  le moteur génère AUTOMATIQUEMENT :
//    • le panneau d'administration (liste + création + édition + suppression),
//    • la page liste publique      →  {route}
//    • la page détail publique      →  {route}/[slug]
//
//  Ajouter un type de contenu = ajouter une clé ici. Aucune migration,
//  aucune page à coder : tout passe par la table générique `entries`.
//
//  ── Types de champ disponibles (rendus par le CollectionManager) ───────────
//    text      : ligne de texte           bool      : interrupteur
//    textarea  : texte multi-lignes        number    : nombre
//    slug      : identifiant d'URL (auto   image     : 1 image (upload+compress)
//                depuis `from`)            gallery   : plusieurs images
//    richtext  : éditeur riche             category  : catégorie (liste gérable)
//    date      : date                      seo       : titre + meta description
//    select    : choix dans `options`      link      : URL externe
// =============================================================================

export const collections = {
  // ── Exemple 1 : un flux d'actualités (liste chronologique) ────────────────
  news: {
    label: "Actualités",
    labelSingular: "Actualité",
    icon: "newspaper",
    route: "/actus",         // pages publiques : /actus et /actus/[slug]
    public: true,            // false = contenu géré mais sans page publique
    ordered: false,          // false = tri par date ; true = tri manuel (drag)
    sort: "-published_at",   // tri par défaut de la liste
    fields: {
      title:        { type: "text", label: "Titre", required: true },
      slug:         { type: "slug", from: "title" },
      cover:        { type: "image", label: "Couverture" },
      excerpt:      { type: "textarea", label: "Accroche" },
      body:         { type: "richtext", label: "Contenu" },
      category:     { type: "category", label: "Rubrique" },
      published_at: { type: "date", label: "Date de publication" },
      published:    { type: "bool", label: "Publié", default: false },
      seo:          { type: "seo" },
    },
  },


  // Le site foot ajoutera ses collections ici (joueurs, matchs, etc.)
  // en réutilisant exactement le même schéma déclaratif.
};

export default collections;

// Petits utilitaires de lecture (utilisés par l'admin et les pages publiques).
export const collectionList = () =>
  Object.entries(collections).map(([key, c]) => ({ key, ...c }));

export const publicCollections = () =>
  collectionList().filter((c) => c.public !== false);

export const getCollection = (key) =>
  collections[key] ? { key, ...collections[key] } : null;

export const collectionByRoute = (route) =>
  collectionList().find((c) => c.route === route) || null;
