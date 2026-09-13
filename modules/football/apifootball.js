import { registerProvider } from "./providers";

const BASE = "https://v3.football.api-sports.io";
function seasonYear(s) { const m = String(s ?? "").match(/\d{4}/); return m ? m[0] : String(new Date().getFullYear()); }
function mapStatus(short) {
  if (["FT", "AET", "PEN"].includes(short)) return "finished";
  if (["PST", "CANC", "ABD", "SUSP", "INT"].includes(short)) return "postponed";
  if (["NS", "TBD"].includes(short)) return "scheduled";
  return "live";
}
function mapFixture(f) {
  return {
    external_id: String(f.fixture.id),
    home_ext: String(f.teams.home.id), away_ext: String(f.teams.away.id),
    home_name: f.teams.home.name, away_name: f.teams.away.name,
    home_score: f.goals.home, away_score: f.goals.away,
    status: mapStatus(f.fixture.status?.short), minute: f.fixture.status?.elapsed ?? null,
    matchday: f.league?.round ? (Number((String(f.league.round).match(/\d+/) || [])[0]) || null) : null,
    kickoff: f.fixture.date || null,
  };
}
async function api(path, ctx) {
  const key = ctx.apifootballKey || process.env.APIFOOTBALL_KEY;
  if (!key) throw new Error("APIFOOTBALL_KEY manquante");
  const r = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": key } });
  const j = await r.json();
  if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) throw new Error("API-Football: " + JSON.stringify(j.errors));
  return j.response || [];
}

// external_id = id de ligue API-Football (JPL = 144). season = année (ex. 2024).
const provider = {
  key: "apifootball",
  async fetchClubs(competition, ctx = {}) {
    const y = seasonYear(competition.ext?.season || ctx.season);
    const rows = await api(`/teams?league=${competition.external_id}&season=${y}`, ctx);
    return rows.map((x) => ({ external_id: String(x.team.id), name: x.team.name, logo_url: x.team.logo || null, city: x.venue?.city || null }));
  },
  async fetchMatches(competition, ctx = {}) {
    const y = seasonYear(competition.ext?.season || ctx.season);
    return (await api(`/fixtures?league=${competition.external_id}&season=${y}`, ctx)).map(mapFixture);
  },
  // Sync intelligente : uniquement les matchs en direct (1 requête légère).
  async fetchLiveMatches(competition, ctx = {}) {
    return (await api(`/fixtures?league=${competition.external_id}&live=all`, ctx)).map(mapFixture);
  },
  // Coverage flags de la ligue/saison (lineups, players, injuries, statistics…).
  async fetchCoverage(competition, ctx = {}) {
    const y = seasonYear(competition.ext?.season || ctx.season);
    const rows = await api(`/leagues?id=${competition.external_id}&season=${y}`, ctx);
    const seas = rows[0]?.seasons?.find((s) => String(s.year) === String(y));
    return seas?.coverage || rows[0]?.seasons?.[0]?.coverage || null;
  },
};
registerProvider(provider);
export default provider;
