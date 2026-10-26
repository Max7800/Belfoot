import { supabase } from "@/lib/supabaseClient";
import { competitionHref } from "@/lib/competitionLinks";
import { COMPETITION_SCOPE_BY_KEY, resolveCompetitionScope } from "@/lib/competitionScopes";
import { matchesQuery } from "@/lib/textMatch";

// Provider de recherche du module football. Alimente la recherche unifiée
// via le même contrat que le socle : { key, types, search(query) }.
//
// Compétitions : seulement les compétitions VISIBLES (une page masquée n'est pas
// une page publique), comparées sans accents (« conference » → « Conférence
// League ») sur le nom, le titre du bandeau et le slug ; lien canonique ou par
// identifiant pour les homonymes (competitionHref).
const COMPETITION_LIMIT = 10;

export function matchingCompetitions(competitions = [], query = "") {
  if (!query?.trim()) return [];
  const visible = competitions.filter((competition) => competition.public_visible !== false);
  return visible
    // Le slug compte aussi : « jupiler » trouve la Pro League (/competitions/jupiler-pro-league).
    .filter((competition) => matchesQuery([competition.name, competition.header_title, String(competition.slug || "").replace(/-/g, " ")], query))
    .slice(0, COMPETITION_LIMIT)
    .map((competition) => ({
      id: competition.id,
      type: "competition",
      typeLabel: "Compétitions",
      title: competition.header_title?.trim() || competition.name,
      subtitle: COMPETITION_SCOPE_BY_KEY[resolveCompetitionScope(competition)]?.label || null,
      url: competitionHref(competition, competitions),
    }))
    .filter((result) => result.url);
}

const footballSearch = {
  key: "football",
  types: [{ key: "competition", label: "Compétitions" }, { key: "club", label: "Clubs" }, { key: "player", label: "Joueurs" }],
  async search(query, { locale } = {}) {  // locale acceptée (contrat), réservée
    if (!query?.trim()) return [];
    const q = `%${query}%`;
    const [{ data: competitions }, { data: clubs }, { data: players }] = await Promise.all([
      // Peu de lignes (quelques dizaines) : filtrées ici, sans accents.
      supabase.from("competitions").select("id,name,slug,header_title,public_visible,competition_scope"),
      supabase.from("clubs").select("id,name").ilike("name", q).limit(10),
      supabase.from("players").select("id,name").ilike("name", q).limit(10),
    ]);
    return [
      ...matchingCompetitions(competitions || [], query),
      ...(clubs || []).map((c) => ({ id: c.id, type: "club", typeLabel: "Clubs", title: c.name, url: `/clubs/${c.id}` })),
      ...(players || []).map((p) => ({ id: p.id, type: "player", typeLabel: "Joueurs", title: p.name, url: `/players/${p.id}` })),
    ];
  },
};
export default footballSearch;
