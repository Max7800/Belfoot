// Regroupement des postes en 4 lignes (Gardiens / Défenseurs / Milieux / Attaquants).
// Tolérant aux libellés anglais complets ET aux abréviations (GK/DEF/MID/FWD),
// avec repli « Autres » pour un poste inconnu ou vide.
const GROUPS = [
  { key: "GK", label: "Gardiens", match: ["goalkeeper", "gk", "gardien"] },
  { key: "DEF", label: "Défenseurs", match: ["defender", "def", "défenseur", "defenseur", "back"] },
  { key: "MID", label: "Milieux", match: ["midfielder", "mid", "milieu"] },
  { key: "FWD", label: "Attaquants", match: ["attacker", "forward", "fwd", "att", "attaquant", "striker", "winger", "ailier", "avant"] },
];
const OTHER = { key: "OTHER", label: "Autres", order: 99 };

export function positionGroup(position = "") {
  const p = String(position || "").trim().toLowerCase();
  if (!p) return OTHER;
  const index = GROUPS.findIndex((group) => group.match.some((m) => p === m || p.startsWith(m)));
  return index >= 0 ? { ...GROUPS[index], order: index } : OTHER;
}

// Renvoie [{ key, label, order, rows }] trié GK→DEF→MID→FWD→Autres, groupes vides omis.
export function groupByPosition(rows = [], getPosition = (row) => row.position) {
  const buckets = new Map();
  for (const row of rows) {
    const group = positionGroup(getPosition(row));
    if (!buckets.has(group.key)) buckets.set(group.key, { key: group.key, label: group.label, order: group.order, rows: [] });
    buckets.get(group.key).rows.push(row);
  }
  return [...buckets.values()].sort((a, b) => a.order - b.order);
}
