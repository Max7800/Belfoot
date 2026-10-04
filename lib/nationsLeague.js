import { computeStandings } from "./standings";
import { isMatchOver } from "./matchStatus";

export function isNationsLeagueCompetition(competition) {
  return String(competition?.external_id || "") === "5"
    || /nations league/i.test(`${competition?.name || ""} ${competition?.header_title || ""}`);
}

export function nationsLeagueDivision(value) {
  return String(value || "").match(/(?:league|ligue)\s+([A-D])\b/i)?.[1]?.toUpperCase() || null;
}

export function nationsLeagueGroupLabel(value, fallback = "Groupe") {
  const group = String(value || "").match(/group(?:e)?\s+(\d+)/i)?.[1];
  return group ? `Groupe ${group}` : fallback;
}

function fallbackGroups(matches = [], clubs = {}) {
  const byDivision = new Map();
  for (const match of matches) {
    const division = nationsLeagueDivision(match.phase || match.round_raw);
    if (!division || !match.home_club_id || !match.away_club_id) continue;
    const list = byDivision.get(division) || [];
    list.push(match);
    byDivision.set(division, list);
  }

  const groups = [];
  for (const [division, divisionMatches] of byDivision) {
    const parent = new Map();
    const find = (id) => {
      if (!parent.has(id)) parent.set(id, id);
      if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
      return parent.get(id);
    };
    const unite = (a, b) => {
      const rootA = find(a); const rootB = find(b);
      if (rootA !== rootB) parent.set(rootB, rootA);
    };
    for (const match of divisionMatches) unite(match.home_club_id, match.away_club_id);
    const components = new Map();
    for (const id of parent.keys()) {
      const root = find(id);
      if (!components.has(root)) components.set(root, new Set());
      components.get(root).add(id);
    }
    const ordered = [...components.values()].sort((a, b) => {
      const firstA = [...a].map((id) => clubs[id]?.name || id).sort()[0] || "";
      const firstB = [...b].map((id) => clubs[id]?.name || id).sort()[0] || "";
      return firstA.localeCompare(firstB, "fr");
    });
    ordered.forEach((teamIds, index) => {
      const groupMatches = divisionMatches.filter((match) => teamIds.has(match.home_club_id) && teamIds.has(match.away_club_id));
      groups.push({
        label: `Ligue ${division} · groupe détecté ${index + 1}`,
        division,
        official: false,
        rows: computeStandings(groupMatches.filter(isMatchOver)),
      });
    });
  }
  return groups;
}

export function nationsLeagueGroups(competition, season, matches = [], clubs = {}) {
  const stored = competition?.ext?.standings_by_season?.[season];
  if (Array.isArray(stored) && stored.length) {
    return stored
      .map((group) => {
        // On garde la STRUCTURE officielle du groupe (équipes + libellé Ligue A/B…),
        // mais on RECALCULE le classement depuis les matchs joués (toujours à jour),
        // au lieu d'afficher le snapshot figé à la synchronisation (points périmés).
        const teamIds = new Set((group.rows || []).map((r) => r.club).filter(Boolean));
        const groupMatches = teamIds.size ? matches.filter((m) => teamIds.has(m.home_club_id) && teamIds.has(m.away_club_id)) : [];
        const fresh = computeStandings(groupMatches.filter(isMatchOver));
        return { ...group, division: group.division || nationsLeagueDivision(group.label), official: true, rows: fresh.length ? fresh : (group.rows || []) };
      })
      .filter((group) => group.division && Array.isArray(group.rows))
      .sort((a, b) => a.division.localeCompare(b.division) || String(a.label).localeCompare(String(b.label), "fr", { numeric: true }));
  }
  return fallbackGroups(matches, clubs);
}
