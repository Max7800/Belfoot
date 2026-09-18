import { registerProvider } from "./providers";
import { seasonLabel } from "./season";

const BASE = (key) => `https://www.thesportsdb.com/api/v1/json/${key || "3"}`;
async function getJson(url) { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw new Error("TheSportsDB indisponible (HTTP " + r.status + ")"); return r.json(); }
function mapStatus(s) {
  const v = (s || "").toLowerCase();
  if (v.includes("finished") || v === "ft" || v === "aet" || v === "pen") return "finished";
  if (v.includes("postp")) return "postponed";
  if (v.includes("1h") || v.includes("2h") || v.includes("live") || v.includes("ht")) return "live";
  return "scheduled";
}

const provider = {
  key: "thesportsdb",
  async fetchClubs(competition, ctx = {}) {
    const key = ctx.thesportsdbKey || process.env.THESPORTSDB_KEY;
    const d = await getJson(`${BASE(key)}/lookup_all_teams.php?id=${competition.external_id}`);
    return (d.teams || []).map((t) => ({
      external_id: String(t.idTeam), name: t.strTeam,
      short_name: t.strTeamShort || null, logo_url: t.strBadge || null, city: t.strLocation || null,
      founded_year: t.intFormedYear ? Number(t.intFormedYear) : null,
      stadium_name: t.strStadium || null,
      stadium_capacity: t.intStadiumCapacity ? Number(String(t.intStadiumCapacity).replace(/[^0-9]/g, "")) : null,
      stadium_address: t.strStadiumLocation || null,
      stadium_image_url: t.strStadiumThumb || null,
    }));
  },
  async fetchMatches(competition, ctx = {}) {
    const key = ctx.thesportsdbKey || process.env.THESPORTSDB_KEY;
    const season = seasonLabel(ctx.season || competition.ext?.season);
    if (!season) return [];
    const d = await getJson(`${BASE(key)}/eventsseason.php?id=${competition.external_id}&s=${season}`);
    return (d.events || []).map((e) => ({
      external_id: String(e.idEvent),
      home_ext: e.idHomeTeam ? String(e.idHomeTeam) : null,
      away_ext: e.idAwayTeam ? String(e.idAwayTeam) : null,
      home_name: e.strHomeTeam || null,
      away_name: e.strAwayTeam || null,
      home_score: e.intHomeScore != null && e.intHomeScore !== "" ? Number(e.intHomeScore) : null,
      away_score: e.intAwayScore != null && e.intAwayScore !== "" ? Number(e.intAwayScore) : null,
      status: mapStatus(e.strStatus),
      matchday: e.intRound != null && e.intRound !== "" ? Number(e.intRound) : null,
      kickoff: e.dateEvent ? `${e.dateEvent}T${e.strTime || "00:00:00"}` : null,
    }));
  },
};
registerProvider(provider);
export default provider;
