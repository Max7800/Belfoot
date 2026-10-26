import siteConfig from "@/config/site";
import { absoluteUrl, siteOrigin } from "@/lib/siteUrl";

// Indexation fermée (siteConfig.seo.indexable) : l'exploration reste permise
// pour que les robots lisent la consigne « noindex » des pages ; aucun sitemap
// n'est annoncé. Ouverte : sitemap et hôte annoncés.
export default function robots() {
  const rules = { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/compte", "/reset", "/login", "/auth"] };
  if (!siteConfig.seo?.indexable) return { rules };
  return { rules, sitemap: absoluteUrl("/sitemap.xml"), host: siteOrigin() };
}
