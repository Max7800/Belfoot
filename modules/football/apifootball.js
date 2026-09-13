import { registerProvider } from "./providers";

const BASE = "https://v3.football.api-sports.io";
function seasonYear(s) { const m = String(s ?? "").match(/\d{4}/); return m ? m[0] : String(new Date().getFullYear()); }
function mapStatus(short) {
  if (["FT", "AET", "PEN"].includes(short)) return "finished";
  if (["PST", "CANC", "ABD", "SUSP", "INT"].includes(short)) return "postponed";
  if (["NS", "TBD"].includes(short)) return "scheduled";
  return "live";
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
    const rows = await api(`/fixtures?league=${competition.external_id}&season=${y}`, ctx);
    return rows.map((f) => ({
      external_id: String(f.fixture.id),
      home_ext: String(f.teams.home.id), away_ext: String(f.teams.away.id),
      home_name: f.teams.home.name, away_name: f.teams.away.name,
      home_score: f.goals.home, away_score: f.goals.away,
      status: mapStatus(f.fixture.status?.short), minute: f.fixture.status?.elapsed ?? null,
      matchday: f.league?.round ? (Number((String(f.league.round).match(/\d+/) || [])[0]) || null) : null,
      kickoff: f.fixture.date || null,
    }));
  },
};
registerProvider(provider);
export default provider;
