import { supabase } from "@/lib/supabaseClient";

// Provider de recherche du module football. Alimente la recherche unifiée
// via le même contrat que le socle : { key, types, search(query) }.
const footballSearch = {
  key: "football",
  types: [{ key: "club", label: "Clubs" }, { key: "player", label: "Joueurs" }],
  async search(query, { locale } = {}) {  // locale acceptée (contrat), réservée
    if (!query?.trim()) return [];
    const q = `%${query}%`;
    const [{ data: clubs }, { data: players }] = await Promise.all([
      supabase.from("clubs").select("id,name").ilike("name", q).limit(10),
      supabase.from("players").select("id,name").ilike("name", q).limit(10),
    ]);
    return [
      ...(clubs || []).map((c) => ({ id: c.id, type: "club", typeLabel: "Clubs", title: c.name, url: "/matchs" })),
      ...(players || []).map((p) => ({ id: p.id, type: "player", typeLabel: "Joueurs", title: p.name, url: "/matchs" })),
    ];
  },
};
export default footballSearch;
