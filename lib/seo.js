import siteConfig from "@/config/site";
import { absoluteUrl } from "@/lib/siteUrl";
// Construit un objet metadata Next complet (title/desc/canonical/OG/Twitter).
export function buildMetadata({ title, description, image, path } = {}) {
  const t = title || siteConfig.name;
  const desc = description || siteConfig.description;
  const url = path ? absoluteUrl(path) : undefined;
  return {
    title: t, description: desc,
    alternates: url ? { canonical: url } : undefined,
    openGraph: { title: t, description: desc, url, siteName: siteConfig.name, images: image ? [{ url: image }] : undefined, locale: siteConfig.defaultLocale },
    twitter: { card: image ? "summary_large_image" : "summary", title: t, description: desc, images: image ? [image] : undefined },
  };
}

// Métadonnées d'une SECTION (layout.js couvrant des sous-pages) : titre par
// défaut de la section, sans adresse canonique, et modèle « … · Belfoot »
// transmis aux sous-pages (un titre simple dans un layout l'interromprait).
export function sectionMetadata({ title, description } = {}) {
  return { ...buildMetadata({ title, description }), title: { default: title, template: `%s · ${siteConfig.name}` } };
}
