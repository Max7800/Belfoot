import siteConfig from "@/config/site";

const BASE = `https://${siteConfig.domain}`;

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/compte", "/reset", "/login", "/auth"],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
