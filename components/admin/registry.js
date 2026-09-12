"use client";
// Registre client : associe une clé de panneau admin à son composant.
// Les collections passent par le CollectionManager générique ; les modules
// métier fournissent leurs propres composants d'admin.
import CollectionManager from "@/components/admin/CollectionManager";
import ContributionsQueue from "@/components/admin/ContributionsQueue";
import CategoriesManager from "@/components/admin/CategoriesManager";
import MatchesAdmin from "@/modules/football/admin/MatchesAdmin";
import ClubsAdmin from "@/modules/football/admin/ClubsAdmin";
import { collections } from "@/config/collections";

const MODULE_PANELS = {
  "football-matches": MatchesAdmin,
  "football-clubs": ClubsAdmin,
};

const CAPABILITY = { contributions: ContributionsQueue, categories: CategoriesManager };

export function panelComponent(key) {
  if (CAPABILITY[key]) return { Comp: CAPABILITY[key], props: {} };
  if (collections[key]) return { Comp: CollectionManager, props: { collectionKey: key } };
  const Comp = MODULE_PANELS[key];
  return Comp ? { Comp, props: {} } : null;
}
