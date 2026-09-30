import siteConfig from "@/config/site";
import { supabase } from "@/lib/supabaseClient";
import { competitionPath } from "@/lib/competitionRoutes";

const BASE = `https://${siteConfig.domain}`;
const abs = (p) => `${BASE}${p}`;

// Sitemap dynamique : se remplit tout seul avec le contenu publié + les entités.
// Tolérant : si une table manque ou est vide, on garde au moins les routes statiques.
export default async function sitemap() {
  const now = new Date();
  const staticRoutes = ["/", "/competitions", "/diables-rouges", "/belges-a-l-etranger", "/onze", "/forum", "/proposer", "/direct", "/recherche", "/cgu", "/confidentialite", "/mentions-legales"]
    .map((p) => ({ url: abs(p), lastModified: now }));
  const dynamic = [];

  const routeByCollection = { news: "/actus", mercato: "/mercato", scouting: "/scouting" };
  try {
    const { data } = await supabase.from("entries").select("collection,slug,updated_at").in("collection", ["news", "mercato", "scouting"]).eq("published", true).is("deleted_at", null);
    for (const e of data || []) { const r = routeByCollection[e.collection]; if (r && e.slug) dynamic.push({ url: abs(`${r}/${e.slug}`), lastModified: e.updated_at ? new Date(e.updated_at) : now }); }
  } catch { /* ignore */ }
  try {
    const { data } = await supabase.from("competitions").select("*").eq("public_visible", true);
    for (const c of data || []) { const p = competitionPath(c); if (p) dynamic.push({ url: abs(p), lastModified: now }); }
  } catch { /* ignore */ }
  try {
    const { data } = await supabase.from("clubs").select("id").limit(3000);
    for (const c of data || []) dynamic.push({ url: abs(`/clubs/${c.id}`), lastModified: now });
  } catch { /* ignore */ }
  try {
    const { data } = await supabase.from("players").select("id").eq("active", true).limit(8000);
    for (const p of data || []) dynamic.push({ url: abs(`/players/${p.id}`), lastModified: now });
  } catch { /* ignore */ }
  try {
    const { data } = await supabase.from("forum_topics").select("id,last_activity").limit(2000);
    for (const t of data || []) dynamic.push({ url: abs(`/forum/${t.id}`), lastModified: t.last_activity ? new Date(t.last_activity) : now });
  } catch { /* ignore */ }

  return [...staticRoutes, ...dynamic];
}
