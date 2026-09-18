import { registerProvider } from "./providers";
import { seasonYear } from "./season";

const BASE = "https://v3.football.api-sports.io";
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
    home_logo: f.teams.home.logo || null, away_logo: f.teams.away.logo || null,
    home_score: f.goals.home, away_score: f.goals.away,
    status: mapStatus(f.fixture.status?.short), minute: f.fixture.status?.elapsed ?? null,
    round: f.league?.round || null,
    kickoff: f.fixture.date || null,
  };
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiFull(path, ctx = {}) {
  const key = ctx.apifootballKey || process.env.APIFOOTBALL_KEY;
  if (!key) throw new Error("APIFOOTBALL_KEY manquante");
  const timeoutMs = Math.max(3000, Math.min(Number(ctx.providerTimeoutMs) || 12000, 30000));
  const maxAttempts = Math.max(1, Math.min(Number(ctx.providerAttempts) || 2, 2));
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await ctx.requestTracker?.beforeRequest?.(path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${BASE}${path}`, {
        headers: { "x-apisports-key": key },
        signal: controller.signal,
        cache: "no-store",
      });
      await ctx.requestTracker?.afterResponse?.(response.headers);
      const text = await response.text();
      let json;
      try { json = text ? JSON.parse(text) : {}; }
      catch { throw new Error(`API-Football: réponse invalide (HTTP ${response.status})`); }

      const providerErrors = json.errors && (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors).length);
      if (response.status === 429) throw new Error("API-Football: quota ou limite de fréquence atteint (HTTP 429)");
      if (!response.ok) {
        const error = new Error(`API-Football indisponible (HTTP ${response.status})`);
        error.retryable = response.status >= 500;
        throw error;
      }
      if (providerErrors) throw new Error("API-Football: " + JSON.stringify(json.errors));
      return json;
    } catch (error) {
      const timedOut = error?.name === "AbortError";
      lastError = timedOut ? new Error(`API-Football: délai dépassé après ${timeoutMs / 1000}s`) : error;
      const retryable = timedOut || error?.retryable;
      if (!retryable || attempt >= maxAttempts) throw lastError;
      await wait(350 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("API-Football indisponible");
}
const api = async (path, ctx) => (await apiFull(path, ctx)).response || [];

const provider = {
  key: "apifootball",
  // Infos ligue : nom réel (auto-vérification de l'id) + pays + coverage flags.
  async fetchLeagueInfo(competition, ctx = {}) {
    const y = seasonYear(ctx.season || competition.ext?.season);
    const rows = await api(`/leagues?id=${competition.external_id}&season=${y}`, ctx);
    const L = rows[0]; if (!L) return null;
    const seas = L.seasons?.find((s) => String(s.year) === String(y)) || L.seasons?.[0];
    return { name: L.league?.name, logo: L.league?.logo || null, type: L.league?.type || null, country: L.country?.name, flag: L.country?.flag || null, coverage: seas?.coverage || null };
  },
  async fetchClubs(competition, ctx = {}) {
    const y = seasonYear(ctx.season || competition.ext?.season);
    const rows = await api(`/teams?league=${competition.external_id}&season=${y}`, ctx);
    return rows.map((x) => ({
      external_id: String(x.team.id), name: x.team.name, logo_url: x.team.logo || null, city: x.venue?.city || null,
      founded_year: x.team.founded ?? null,
      stadium_name: x.venue?.name || null,
      stadium_capacity: x.venue?.capacity ?? null,
      stadium_address: [x.venue?.address, x.venue?.city].filter(Boolean).join(", ") || null,
      stadium_image_url: x.venue?.image || null,
    }));
  },
  async fetchClubById(teamExternalId, ctx = {}) {
    const rows = await api(`/teams?id=${teamExternalId}`, ctx);
    const x = rows[0];
    if (!x?.team?.id) return null;
    return {
      external_id: String(x.team.id), name: x.team.name, logo_url: x.team.logo || null, city: x.venue?.city || null,
      founded_year: x.team.founded ?? null,
      stadium_name: x.venue?.name || null,
      stadium_capacity: x.venue?.capacity ?? null,
      stadium_address: [x.venue?.address, x.venue?.city].filter(Boolean).join(", ") || null,
      stadium_image_url: x.venue?.image || null,
    };
  },
  async fetchMatches(competition, ctx = {}) {
    const y = seasonYear(ctx.season || competition.ext?.season);
    return (await api(`/fixtures?league=${competition.external_id}&season=${y}`, ctx)).map(mapFixture);
  },
  async fetchTeamMatches(competition, teamExternalId, ctx = {}) {
    const y = seasonYear(ctx.season || competition.ext?.season);
    const rows = await api(`/fixtures?team=${teamExternalId}&season=${y}`, ctx);
    return rows.filter((fixture) => String(fixture.league?.id) === String(competition.external_id)).map(mapFixture);
  },
  async fetchLiveMatches(competition, ctx = {}) {
    return (await api(`/fixtures?league=${competition.external_id}&live=all`, ctx)).map(mapFixture);
  },
  // DISCOVERY : effectif d'un club (avec nationalité) — paginé, plafonné.
  async fetchSquadPlayers(club, ctx = {}) {
    const y = seasonYear(ctx.season);
    const pageCap = Math.max(1, Math.min(Number(ctx.playerPageCap) || 3, 3));
    const out = []; let page = 1, pages = 1;
    do {
      const j = await apiFull(`/players?team=${club.external_id}&season=${y}&page=${page}`, ctx);
      pages = j.paging?.total || 1;
      for (const x of j.response || []) {
        const arr = x.statistics || [];
        const st = ctx.leagueId
          ? arr.find((z) => String(z.league?.id) === String(ctx.leagueId) && (!z.team?.id || String(z.team.id) === String(club.external_id)))
          : arr.find((z) => !z.team?.id || String(z.team.id) === String(club.external_id)) || arr[0] || null;
        // `/players?team=` peut remonter les statistiques d'autres équipes du
        // même joueur. Sans ligne correspondant à CE club et CE championnat,
        // il ne fait pas partie de l'effectif de compétition demandé.
        if (ctx.leagueId && !st) continue;
        out.push({
          external_id: String(x.player.id), name: x.player.name, nationality: x.player.nationality,
          position: st?.games?.position || null, photo_url: x.player.photo || null,
          age: x.player.age ?? null, birth_date: x.player.birth?.date || null,
          stats: st ? {
            appearances: st.games?.appearences || 0, lineups: st.games?.lineups || 0, minutes: st.games?.minutes || 0,
            goals: st.goals?.total || 0, assists: st.goals?.assists || 0,
            yellow: st.cards?.yellow || 0, red: st.cards?.red || 0,
            rating: st.games?.rating ? Number(st.games.rating) : null,
          } : null,
        });
      }
      page++;
    } while (page <= pages && page <= pageCap);   // plan gratuit API-Football : page <= 3
    return out;
  },
  // Effectif actuel brut du club. Cette route est volontairement séparée des
  // statistiques de compétition : elle servira au futur import payant sans
  // mélanger automatiquement une équipe première avec son U23.
  async fetchCurrentSquad(club, ctx = {}) {
    const rows = await api(`/players/squads?team=${club.external_id}`, ctx);
    const squad = rows.find((row) => String(row.team?.id) === String(club.external_id)) || rows[0];
    return (squad?.players || []).map((player) => ({
      external_id: String(player.id),
      name: player.name,
      age: player.age ?? null,
      number: player.number ?? null,
      position: player.position || null,
      photo_url: player.photo || null,
      ext: player,
    }));
  },
  // TRACKING : stats agrégées de saison d'un joueur (1 requête).
  async fetchPlayerSeason(player, ctx = {}) {
    const y = seasonYear(ctx.season);
    const row = (await api(`/players?id=${player.external_id}&season=${y}`, ctx))[0];
    if (!row) return null;
    const stats = (row.statistics || []).filter((st) => !ctx.leagueId || String(st.league?.id) === String(ctx.leagueId));
    if (!stats.length) return null;
    const a = { appearances: 0, lineups: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, rating: null };
    for (const st of stats) {
      a.appearances += st.games?.appearences || 0; a.lineups += st.games?.lineups || 0; a.minutes += st.games?.minutes || 0;
      a.goals += st.goals?.total || 0; a.assists += st.goals?.assists || 0;
      a.yellow += st.cards?.yellow || 0; a.red += st.cards?.red || 0;
      if (st.games?.rating) a.rating = Number(st.games.rating);
    }
    return { season: y, ...a };
  },
  // API-Football utilise historiquement la route `/coachs`. On ne conserve que
  // l'entraîneur dont la carrière dans ce club n'a pas de date de fin.
  async fetchCurrentCoach(club, ctx = {}) {
    if (!club?.external_id) return null;
    const rows = await api(`/coachs?team=${club.external_id}`, ctx);
    const current = rows.find((coach) => (coach.career || []).some((career) => String(career.team?.id) === String(club.external_id) && !career.end)) || rows[0];
    if (!current?.id) return null;
    return {
      external_id: String(current.id),
      name: current.name || [current.firstname, current.lastname].filter(Boolean).join(" ") || "Entraîneur",
      photo_url: current.photo || null,
      ext: current,
    };
  },
  // Une requête par match : formation et ordre officiel des titulaires/remplaçants.
  async fetchMatchLineups(match, ctx = {}) {
    if (!match?.external_id) return [];
    const rows = await api(`/fixtures/lineups?fixture=${match.external_id}`, ctx);
    return rows.map((row) => {
      const teamExt = row.team?.id ? String(row.team.id) : null;
      const mapPlayer = (entry, starter) => ({
        team_ext: teamExt,
        player_ext: entry.player?.id ? String(entry.player.id) : null,
        player_name: entry.player?.name || null,
        number: entry.player?.number ?? null,
        position: entry.player?.pos || null,
        grid: entry.player?.grid || null,
        starter,
        substitute: !starter,
        ext: entry,
      });
      return {
        team_ext: teamExt,
        formation: row.formation || null,
        players: [
          ...(row.startXI || []).map((entry) => mapPlayer(entry, true)),
          ...(row.substitutes || []).map((entry) => mapPlayer(entry, false)),
        ],
        ext: row,
      };
    });
  },
  // Une seconde requête, uniquement via le job plafonné : minutes, note et actions du joueur.
  async fetchMatchPlayerStats(match, ctx = {}) {
    if (!match?.external_id) return [];
    const teams = await api(`/fixtures/players?fixture=${match.external_id}`, ctx);
    const output = [];
    for (const team of teams) {
      const teamExt = team.team?.id ? String(team.team.id) : null;
      for (const row of team.players || []) {
        const stat = row.statistics?.[0] || {};
        output.push({
          team_ext: teamExt,
          player_ext: row.player?.id ? String(row.player.id) : null,
          player_name: row.player?.name || null,
          number: stat.games?.number ?? null,
          position: stat.games?.position || null,
          starter: stat.games?.substitute === false,
          substitute: stat.games?.substitute === true,
          captain: !!stat.games?.captain,
          minutes: stat.games?.minutes ?? null,
          rating: stat.games?.rating ? Number(stat.games.rating) : null,
          goals: stat.goals?.total || 0,
          assists: stat.goals?.assists || 0,
          saves: stat.goals?.saves || 0,
          goals_conceded: stat.goals?.conceded ?? null,
          yellow: stat.cards?.yellow || 0,
          red: stat.cards?.red || 0,
          ext: row,
        });
      }
    }
    return output;
  },
};
provider.fetchEvents = async function (match, ctx = {}) {
  const raw = await api(`/fixtures/events?fixture=${match.external_id}`, ctx);
  const events = [];
  for (const e of raw) {
    const minute = e.time?.elapsed ?? null;
    const team_ext = e.team?.id ? String(e.team.id) : null;
    if (e.type === "Goal") {
      events.push({ minute, type: "goal", team_ext, detail: e.detail || null,
        player_ext: e.player?.id ? String(e.player.id) : null, player_name: e.player?.name || null,
        assist_name: e.assist?.name || null });
    } else if (e.type === "Card") {
      events.push({ minute, type: /red/i.test(e.detail || "") ? "red" : "yellow", team_ext, detail: e.detail || null,
        player_ext: e.player?.id ? String(e.player.id) : null, player_name: e.player?.name || null });
    } else if (e.type === "subst") {
      events.push({ minute, type: "sub", team_ext, detail: null,
        player_ext: e.player?.id ? String(e.player.id) : null, player_name: e.player?.name || null,
        assist_name: e.assist?.name || null });   // player = sortant, assist = entrant
    }
  }
  return events;
};
registerProvider(provider);
export default provider;
