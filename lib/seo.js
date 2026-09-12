import siteConfig from "@/config/site";
// Construit un objet metadata Next complet (title/desc/canonical/OG/Twitter).
export function buildMetadata({ title, description, image, path } = {}) {
  const t = title || siteConfig.name;
  const desc = description || siteConfig.description;
  const url = path ? `https://${siteConfig.domain}${path}` : undefined;
  return {
    title: t, description: desc,
    alternates: url ? { canonical: url } : undefined,
    openGraph: { title: t, description: desc, url, siteName: siteConfig.name, images: image ? [{ url: image }] : undefined, locale: siteConfig.defaultLocale },
    twitter: { card: image ? "summary_large_image" : "summary", title: t, description: desc, images: image ? [image] : undefined },
  };
}
