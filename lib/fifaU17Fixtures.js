import { frenchNationName } from "./frenchNations";

export const FIFA_U17_FIXTURES_KEY = "football_fifa_u17_2026_fixtures";
export const FIFA_U17_FIXTURES_URL = "https://api.fifa.com/api/v3/calendar/matches?language=en&count=500&idCompetition=102&idSeason=292937";
export const FIFA_U17_PUBLIC_SOURCE = "https://www.fifa.com/en/tournaments/mens/u17worldcup/qatar-2026/scores-fixtures";
export const FIFA_U17_STAGES = {
  "292957": { label: "16es de finale", count: 16 },
  "292952": { label: "8es de finale", count: 8 },
  "292953": { label: "Quarts de finale", count: 4 },
  "292954": { label: "Demi-finales", count: 2 },
  "292955": { label: "Match pour la 3e place", count: 1 },
  "292956": { label: "Finale", count: 1 },
};
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\bu\s*-?\s*17\b/g, "").replace(/[^a-z0-9]+/g, "");
function key(name) {
  const plain = String(name || "").replace(/\s+U\s*-?\s*17$/i, "");
  const alias = { "Côte d'Ivoire": "Ivory Coast", "Côte d’Ivoire": "Ivory Coast", "Republic of Ireland": "Ireland", "Korea Republic": "South Korea" };
  return normalize(frenchNationName(alias[plain] || plain));
}
export function fifaFixtureInMatches(fixture, matches = [], clubs = {}) {
  const names = [key(fixture.home.name), key(fixture.away.name)].sort();
  return matches.some((match) => {
    const home = clubs[match.home_club_id]?.name, away = clubs[match.away_club_id]?.name;
    const time = Date.parse(match.kickoff), official = Date.parse(fixture.kickoff);
    if (!home || !away || !Number.isFinite(time) || !Number.isFinite(official) || Math.abs(time - official) > 48 * 3600000) return false;
    const actual = [key(home), key(away)].sort();
    return actual[0] === names[0] && actual[1] === names[1];
  });
}
export function validFifaStage(stage, fixtures) {
  const info = FIFA_U17_STAGES[stage];
  if (!info || !Array.isArray(fixtures) || fixtures.length !== info.count) return false;
  const teamIds = [], matchIds = [];
  for (const item of fixtures) {
    if (!item?.id || !item.home?.id || !item.away?.id || !item.home?.name || !item.away?.name || !Number.isFinite(Date.parse(item.kickoff))) return false;
    matchIds.push(item.id); teamIds.push(item.home.id, item.away.id);
  }
  return new Set(matchIds).size === fixtures.length && new Set(teamIds).size === fixtures.length * 2;
}
