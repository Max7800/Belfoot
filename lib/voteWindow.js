// État public calculé avec les mêmes limites temporelles que le contrôle serveur.
export function voteWindow(session, now = Date.now()) {
  if (!session) return "unavailable";
  if (session.status === "published") return "published";
  if (session.status === "closed") return "closed";
  if (session.status !== "open") return "unavailable";
  const opens = session.opens_at ? Date.parse(session.opens_at) : null;
  const closes = session.closes_at ? Date.parse(session.closes_at) : null;
  if ((opens !== null && !Number.isFinite(opens)) || (closes !== null && !Number.isFinite(closes)) || (opens !== null && closes !== null && opens >= closes)) return "unavailable";
  if (closes !== null && now >= closes) return "closed";
  if (opens !== null && now < opens) return "upcoming";
  return "open";
}

export const voteWindowLabel = (state) => ({ open: "vote ouvert", upcoming: "vote à venir", closed: "vote fermé", published: "résultat publié", unavailable: "dates à vérifier" })[state] || "indisponible";
