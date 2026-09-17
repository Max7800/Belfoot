export function normalizeTeamName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(kv|fc|rfc|royal|club|football|voetbal|va)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function inferTeamRelation(name) {
  const original = String(name || "").trim();
  const rules = [
    { pattern: /\b(u[ -]?23|under[ -]?23|espoirs?)\b/i, type: "u23" },
    { pattern: /\b(r[ée]serves?|reserve team)\b/i, type: "reserve" },
    { pattern: /^jong\s+/i, type: "u23" },
    { pattern: /\s+(b|ii|2)$/i, type: "reserve" },
  ];
  const rule = rules.find((item) => item.pattern.test(original));
  if (!rule) return { type: "first_team", base: normalizeTeamName(original), detected: false };
  return { type: rule.type, base: normalizeTeamName(original.replace(rule.pattern, " ")), detected: true };
}

export function suggestParentClub(team, clubs) {
  const inferred = inferTeamRelation(team?.name);
  if (!inferred.detected || !inferred.base) return null;
  const candidates = (clubs || []).filter((club) => club.id !== team.id && (club.team_type || "first_team") === "first_team");
  const exact = candidates.filter((club) => normalizeTeamName(club.name) === inferred.base || normalizeTeamName(club.short_name) === inferred.base);
  if (exact.length === 1) return exact[0];
  const close = candidates.filter((club) => { const value = normalizeTeamName(club.name); return value && (value.includes(inferred.base) || inferred.base.includes(value)); });
  return close.length === 1 ? close[0] : null;
}
