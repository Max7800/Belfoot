// La date de naissance permet de recalculer l'âge ; le champ « age » du
// fournisseur peut dater de la dernière synchronisation et n'est pas utilisé.
export function abroadPlayerAge(player, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(player?.birth_date || "").slice(0, 10));
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const birth = new Date(Date.UTC(y, m - 1, d));
  if (birth.getUTCFullYear() !== y || birth.getUTCMonth() !== m - 1 || birth.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age >= 0 && age < 100 ? age : null;
}

export function matchesAbroadAge(player, filter, now = new Date()) {
  if (filter === "all") return true;
  const age = abroadPlayerAge(player, now);
  if (filter === "unknown") return age === null;
  const limit = Number(filter);
  return age !== null && Number.isFinite(limit) && age < limit;
}
