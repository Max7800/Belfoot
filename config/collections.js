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

import { BELFOOT_STATUS_OPTIONS } from "@/lib/statuses";

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
    contribute: true,        // ouvert aux propositions publiques (/proposer)
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


  // ── Rumeurs mercato (contribuable) ────────────────────────────────────────
  mercato: {
    label: "Mercato",
    labelSingular: "Rumeur mercato",
    icon: "repeat",
    route: "/mercato",
    public: true,
    ordered: false,
    sort: "-published_at",
    contribute: true,
    fields: {
      title:        { type: "text", label: "Titre / sujet", required: true },
      slug:         { type: "slug", from: "title" },
      player_name:  { type: "text", label: "Joueur concerné" },
      club_from:    { type: "text", label: "Club actuel" },
      club_to:      { type: "text", label: "Club pressenti" },
      status:       { type: "select", label: "Statut Belfoot", options: BELFOOT_STATUS_OPTIONS, default: "Rumeur" },
      body:         { type: "richtext", label: "Détails" },
      source:       { type: "text", label: "Source (lien / média)" },
      category:     { type: "category", label: "Rubrique" },
      published_at: { type: "date", label: "Date" },
      published:    { type: "bool", label: "Publié", default: false },
      seo:          { type: "seo" },
    },
  },

  // ── Fiches scouting / joueurs à suivre (contribuable) ─────────────────────
  scouting: {
    label: "Scouting",
    labelSingular: "Fiche scouting",
    icon: "search",
    route: "/scouting",
    public: true,
    ordered: false,
    sort: "-published_at",
    contribute: true,
    fields: {
      title:        { type: "text", label: "Joueur / sujet", required: true },
      slug:         { type: "slug", from: "title" },
      cover:        { type: "image", label: "Photo" },
      club:         { type: "text", label: "Club" },
      position:     { type: "text", label: "Poste" },
      body:         { type: "richtext", label: "Analyse" },
      category:     { type: "category", label: "Rubrique" },
      published_at: { type: "date", label: "Date" },
      published:    { type: "bool", label: "Publié", default: false },
      seo:          { type: "seo" },
    },
  },

  // ── Corrections de fiche (contribuable, sans page publique) ───────────────
  // Rapport de correction : le membre décrit la fiche à corriger + le correctif.
  // Pour les fiches foot (tables dédiées) l'admin applique à la main depuis la
  // file ; pour un contenu éditorial, une correction directe (kind:edit) pourra
  // être branchée plus tard — la route d'approbation la gère déjà côté serveur.
  correction: {
    label: "Corrections",
    labelSingular: "Correction de fiche",
    icon: "edit",
    public: false,          // pas de page publique : c'est un journal interne
    ordered: false,
    sort: "-created_at",
    contribute: true,
    fields: {
      title:       { type: "text", label: "Sujet de la correction", required: true },
      target_type: { type: "select", label: "Type de fiche", options: ["Fiche joueur", "Fiche club", "Actualité", "Rumeur mercato", "Autre"], default: "Fiche joueur" },
      target_ref:  { type: "text", label: "Fiche concernée (nom ou lien)" },
      body:        { type: "textarea", label: "Correction proposée" },
    },
  },

  // Ajouter un type contribuable = déclarer une collection ici avec contribute:true ;
  // elle apparaît automatiquement dans /proposer et dans l'admin (Contenu → Page Proposer).
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
