export const FIFA_U17_TEAM_ID = "1880918a-1176-4471-8056-b4b67f3a12e1";
export const FIFA_U17_COMPETITION_ID = "d7088941-8ca5-4d6f-aa3d-c3724d44ba2b";
export const FIFA_U17_ARCHIVE_AFTER = Date.parse("2026-12-28T00:00:00Z");
export const FIFA_U17_KEY = "football_fifa_u17_2026_belgium";
export function fifaU17Snapshot(settings, { teamId, competitionId, season, current = false, now = Date.now() } = {}) {
  if (teamId !== FIFA_U17_TEAM_ID || (current && now >= FIFA_U17_ARCHIVE_AFTER)) return null;
  if (!current && (competitionId !== FIFA_U17_COMPETITION_ID || season !== "2026-2027")) return null;
  const data = settings?.[FIFA_U17_KEY];
  if (!Array.isArray(data?.players) || data.players.length !== 21 || !data.version || !data.observedAt) return null;
  return data;
}
