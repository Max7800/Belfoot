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
async function apiFull(path, ctx) {
  const key = ctx.apifootballKey || process.env.APIFOOTBALL_KEY;
  if (!key) throw new Error("APIFOOTBALL_KEY manquante");
  const r = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": key } });
  const j = await r.json();
  if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) throw new Error("API-Football: " + JSON.stringify(j.errors));
  return j;
}
const api = async (path, ctx) => (await apiFull(path, ctx)).response || [];

const provider = {
  key: "apifootball",
  // Infos ligue : nom réel (auto-vérification de l'id) + pays + coverage flags.
  async fetchLeagueInfo(competition, ctx = {}) {
    const y = seasonYear(competition.ext?.season || ctx.season);
    const rows = await api(`/leagues?id=${competition.external_id}&season=${y}`, ctx);
    const L = rows[0]; if (!L) return null;
    const seas = L.seasons?.find((s) => String(s.year) === String(y)) || L.seasons?.[0];
    return { name: L.league?.name, logo: L.league?.logo || null, country: L.country?.name, coverage: seas?.coverage || null };
  },
  async fetchClubs(competition, ctx = {}) {
    const y = seasonYear(competition.ext?.season || ctx.season);
    const rows = await api(`/teams?league=${competition.external_id}&season=${y}`, ctx);
    return rows.map((x) => ({ external_id: String(x.team.id), name: x.team.name, logo_url: x.team.logo || null, city: x.venue?.city || null }));
  },
  async fetchMatches(competition, ctx = {}) {
    const y = seasonYear(competition.ext?.season || ctx.season);
    return (await api(`/fixtures?league=${competition.external_id}&season=${y}`, ctx)).map(mapFixture);
  },
  async fetchLiveMatches(competition, ctx = {}) {
    return (await api(`/fixtures?league=${competition.external_id}&live=all`, ctx)).map(mapFixture);
  },
  // DISCOVERY : effectif d'un club (avec nationalité) — paginé, plafonné.
  async fetchSquadPlayers(club, ctx = {}) {
    const y = seasonYear(ctx.season);
    const out = []; let page = 1, pages = 1;
    do {
      const j = await apiFull(`/players?team=${club.external_id}&season=${y}&page=${page}`, ctx);
      pages = j.paging?.total || 1;
      for (const x of j.response || []) out.push({
        external_id: String(x.player.id), name: x.player.name, nationality: x.player.nationality,
        position: x.statistics?.[0]?.games?.position || null, photo_url: x.player.photo || null,
        age: x.player.age ?? null, birth_date: x.player.birth?.date || null,
      });
      page++;
    } while (page <= pages && page <= 15);   // plafond quota
    return out;
  },
  // TRACKING : stats agrégées de saison d'un joueur (1 requête).
  async fetchPlayerSeason(player, ctx = {}) {
    const y = seasonYear(ctx.season);
    const row = (await api(`/players?id=${player.external_id}&season=${y}`, ctx))[0];
    if (!row) return null;
    const a = { appearances: 0, lineups: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, rating: null };
    for (const st of row.statistics || []) {
      a.appearances += st.games?.appearences || 0; a.lineups += st.games?.lineups || 0; a.minutes += st.games?.minutes || 0;
      a.goals += st.goals?.total || 0; a.assists += st.goals?.assists || 0;
      a.yellow += st.cards?.yellow || 0; a.red += st.cards?.red || 0;
      if (st.games?.rating) a.rating = Number(st.games.rating);
    }
    return { season: y, ...a };
  },
};
provider.fetchEvents = async function (match, ctx = {}) {
  const raw = await api(`/fixtures/events?fixture=${match.external_id}`, ctx);
  const events = [];
  for (const e of raw) {
    const minute = e.time?.elapsed ?? null;
    const team_ext = e.team?.id ? String(e.team.id) : null;
    if (e.type === "Goal") {
      events.push({ minute, type: "goal", player_ext: e.player?.id ? String(e.player.id) : null, team_ext });
      if (e.assist?.id) events.push({ minute, type: "assist", player_ext: String(e.assist.id), team_ext });
    } else if (e.type === "Card") {
      events.push({ minute, type: /red/i.test(e.detail || "") ? "red" : "yellow", player_ext: e.player?.id ? String(e.player.id) : null, team_ext });
    } else if (e.type === "subst") {
      events.push({ minute, type: "sub", player_ext: e.player?.id ? String(e.player.id) : null, team_ext });
    }
  }
  return events;
};
registerProvider(provider);
export default provider;
