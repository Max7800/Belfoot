import { RBFA_SOURCES } from "./rbfaSources";
import { groupByPosition } from "./positions";

export function rbfaSquadGroups(snapshot) {
  return groupByPosition(snapshot.players, (row) => snapshot.playerDetails?.[row.playerId]?.position);
}

// Identifiants API-Football exacts : ne jamais appliquer la liste masculine à
// une équipe portant un nom voisin ou à une autre catégorie.
export function rbfaCategoryForTeam(team) {
  if (team?.source !== "apifootball") return null;
  return Object.entries(RBFA_SOURCES).find(([, source]) => source.team === String(team.external_id))?.[0] || null;
}

export function rbfaPublicSnapshot(monitor, team) {
  const category = rbfaCategoryForTeam(team);
  const snapshot = category && monitor?.[category];
  if (!Array.isArray(snapshot?.players) || snapshot.players.length < 11 || snapshot.players.length > 60) return null;
  const ids = new Set();
  for (const row of snapshot.players) {
    if (!/^\d+$/.test(row?.sourceId || "") || typeof row.name !== "string" || !row.name.trim() || typeof row.club !== "string" || !row.club.trim() || ids.has(row.sourceId)) return null;
    ids.add(row.sourceId);
  }
  if (!Number.isFinite(Date.parse(snapshot.observedAt))) return null;
  return { ...snapshot, category };
}
