import { supabase } from "@/lib/supabaseClient";
import { publicCollections, getCollection } from "@/config/collections";

// Fournisseur de recherche des contenus éditoriaux (table entries).
// Config d'index NEUTRE ('simple') : pas de langue en dur. `locale` optionnel.
export const entriesProvider = {
  key: "entries",
  types: publicCollections().map((c) => ({ key: c.key, label: c.label })),
  async search(query, { locale } = {}) {
    if (!query?.trim()) return [];
    let qb = supabase
      .from("entries")
      .select("id,collection,title,excerpt,slug,locale")
      .eq("published", true)
      .textSearch("search", query, { type: "websearch", config: "simple" });
    if (locale) qb = qb.eq("locale", locale);
    const { data } = await qb.limit(30);
    return (data || []).map((e) => {
      const c = getCollection(e.collection);
      return { id: e.id, type: e.collection, typeLabel: c?.label || e.collection, title: e.title, subtitle: e.excerpt, url: `${c?.route || ""}/${e.slug}` };
    });
  },
};
