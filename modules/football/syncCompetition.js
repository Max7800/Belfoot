import { getProvider } from "./providers";
import { upsertExternal } from "./sync";

async function clubMap(db, source) {
  const { data } = await db.from("clubs").select("id,external_id").eq("source", source);
  return Object.fromEntries((data || []).map((c) => [c.external_id, c.id]));
}
function resolveMatches(matches, competitionId, map) {
  return matches.map((m) => ({
    external_id: m.external_id, competition_id: competitionId,
    home_club_id: map[m.home_ext] || null, away_club_id: map[m.away_ext] || null,
    home_score: m.home_score, away_score: m.away_score, status: m.status, minute: m.minute ?? null,
    kickoff: m.kickoff, matchday: m.matchday, ext: m,
  }));
}

export async function syncCompetition(db, competition, ctx = {}) {
  const provider = getProvider(competition.provider);
  if (!provider) return `${competition.name}: aucun provider`;
  const mode = ctx.mode || "full";

  // ── Mode LIVE : seulement les matchs en direct (économie de quota) ──────────
  if (mode === "live") {
    const fetchLive = provider.fetchLiveMatches || provider.fetchMatches;
    if (!fetchLive) return `${competition.name}: pas de live`;
    const live = await fetchLive.call(provider, competition, ctx);
    const map = await clubMap(db, competition.provider);
    const n = await upsertExternal(db, "matches", competition.provider, resolveMatches(live, competition.id, map),
      ["home_score", "away_score", "status", "minute"]);   // n'écrase que le score en direct
    return `${competition.name}: live ${n}`;
  }

  // ── Mode FULL : clubs (dérivés + enrichis) + tous les matchs + coverage ─────
  const matches = provider.fetchMatches ? await provider.fetchMatches(competition, ctx) : [];
  const derived = new Map();
  for (const m of matches) {
    if (m.home_ext) derived.set(m.home_ext, { external_id: m.home_ext, name: m.home_name || m.home_ext });
    if (m.away_ext) derived.set(m.away_ext, { external_id: m.away_ext, name: m.away_name || m.away_ext });
  }
  let clubsN = await upsertExternal(db, "clubs", competition.provider, [...derived.values()], ["name"]);
  if (provider.fetchClubs) {
    try { const clubs = await provider.fetchClubs(competition, ctx); await upsertExternal(db, "clubs", competition.provider, clubs, ["name", "short_name", "logo_url", "city"]); } catch {}
  }
  const map = await clubMap(db, competition.provider);
  const matchN = await upsertExternal(db, "matches", competition.provider, resolveMatches(matches, competition.id, map),
    ["competition_id", "home_club_id", "away_club_id", "home_score", "away_score", "status", "minute", "kickoff", "matchday"]);

  let leagueName = competition.name;
  if (provider.fetchLeagueInfo) {
    try {
      const info = await provider.fetchLeagueInfo(competition, ctx);
      if (info) {
        leagueName = info.name || leagueName;
        await db.from("competitions").update({ ext: { ...(competition.ext || {}), coverage: info.coverage, providerName: info.name, country: info.country } }).eq("id", competition.id);
      }
    } catch {}
  }
  return `${leagueName}: ${clubsN} clubs, ${matchN} matchs`;
}
