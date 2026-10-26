// Adresse publique du site : UNE seule source, aucun domaine écrit en dur.
// Ordre : SITE_URL (réglage explicite, facultatif) → adresse de production du
// projet fournie par Vercel (l'adresse en .vercel.app aujourd'hui, le domaine du
// site dès qu'il sera branché dans Vercel) → adresse du déploiement → local.
export function siteOrigin(env = process.env) {
  const host = env.SITE_URL?.trim() || env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  if (!host) return "http://localhost:3000";
  return (/^https?:\/\//i.test(host) ? host : `https://${host}`).replace(/\/+$/, "");
}

export function absoluteUrl(path = "/", env = process.env) {
  return new URL(String(path || "/"), `${siteOrigin(env)}/`).toString();
}
