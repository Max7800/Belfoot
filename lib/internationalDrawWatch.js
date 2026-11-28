// Cibles explicitement vérifiées : les identifiants UEFA et API-Football
// appartiennent à des fournisseurs différents. Les éditions ne sont pas devinées.
export const INTERNATIONAL_DRAW_EVENTS = [
  { id: "euro-2028-qualifying", title: "Qualifications Euro 2028", at: "2026-12-06T17:00:00Z", source: "https://www.uefa.com/euro2028/news/02ab-220f53285777-d06eb4905ec1-1000--uefa-euro-2028-qualifying-draw/", uefaCompetition: "3", uefaSeason: "2028", round: "2002171", groups: 12, teams: 54, category: "senior", apiCompetition: "960", siteSeason: "2028-2029" },
  { id: "u19-2027-round3", title: "Euro U19 2027 · qualifications tour 3", at: "2026-12-10T10:30:00Z", source: "https://www.uefa.com/under19/news/02ab-22181b41a961-5dfbab472e17-1000--uefa-under-19-championship-round-3-draw/", uefaCompetition: "24", uefaSeason: "2027", round: "2002224", groups: 7, teams: 28, category: "u19", apiCompetition: "893", siteSeason: "2027-2028" },
  { id: "u17-2027-round2", title: "Euro U17 2027 · qualifications tour 2", at: "2026-12-10T11:15:00Z", source: "https://www.uefa.com/under17/news/02ab-2219692229fc-aa9d0c422656-1000--uefa-european-under-17-championship-qualifying-round-2-draw/", uefaCompetition: "23", uefaSeason: "2027", round: "2002215", groups: 14, teams: 54, category: "u17", apiCompetition: "886", siteSeason: "2027-2028" },
];
export const UEFA_DRAW_SNAPSHOTS_KEY = "football_uefa_draw_snapshots";
export function validStoredUefaDraw(event, groups) {
  if (!event || !Array.isArray(groups) || groups.length !== event.groups) return false;
  const ids = [], codes = [], groupIds = [];
  for (const group of groups) {
    if (!group?.id || !group.label || !Array.isArray(group.teams) || group.teams.length < 3 || group.teams.length > 4) return false;
    groupIds.push(group.id);
    for (const team of group.teams) {
      if (!team?.id || !/^[A-Z]{3}$/.test(team.code || "") || !team.name) return false;
      ids.push(team.id); codes.push(team.code);
    }
  }
  return new Set(groupIds).size === event.groups && ids.length === event.teams && new Set(ids).size === event.teams && new Set(codes).size === event.teams && codes.filter((code) => code === "BEL").length === 1;
}

export function upcomingInternationalDraws(now = Date.now(), settings = {}) {
  const archiveDelay = 30 * 86400000;
  return INTERNATIONAL_DRAW_EVENTS.filter((event) => now < (event.category === "senior" ? Date.parse(event.at) + archiveDelay : Date.parse("2027-04-01T00:00:00Z")))
    .map((event) => {
      const state = settings?.[UEFA_DRAW_SNAPSHOTS_KEY]?.[event.id] || {};
      return { ...event, status: state.error ? "error" : validStoredUefaDraw(event, state.groups) ? "available" : now < Date.parse(event.at) ? "upcoming" : "check", automatic: event.category !== "senior", attemptedAt: state.attemptedAt || null, error: state.error || null };
    });
}
