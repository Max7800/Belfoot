import { isMatchFinished, isMatchLive, matchStatusMeta } from "./matchStatus";

const DAY = 86400000;
const WINDOW_DAYS = 14;

// Classe uniquement des événements proches : pas de promotion d'une compétition
// terminée parce qu'elle possède une saison active ou un vieux score.
export function competitionActivity(matches = [], now = Date.now()) {
  let best = null;
  for (const match of matches) {
    const at = Date.parse(match.kickoff || "");
    if (!Number.isFinite(at)) continue;
    const delta = at - now;
    if (Math.abs(delta) > WINDOW_DAYS * DAY || matchStatusMeta(match).key === "postponed") continue;
    const live = isMatchLive(match) && Math.abs(delta) <= DAY;
    if (!live && (delta >= 0 ? isMatchFinished(match) : !isMatchFinished(match))) continue;
    const rank = { live: live ? 1 : 0, distance: Math.abs(delta), future: delta >= 0 ? 1 : 0 };
    if (!best || rank.live > best.live || (rank.live === best.live && rank.distance < best.distance)) best = rank;
  }
  return best;
}

export function rankHomeCompetitions(candidates, { now = Date.now(), featuredId = "", limit = 5 } = {}) {
  return candidates.map((candidate) => ({ ...candidate, activity: competitionActivity(candidate.matches, now) }))
    .filter((candidate) => candidate.activity)
    .sort((a, b) => b.activity.live - a.activity.live || a.activity.distance - b.activity.distance ||
      b.activity.future - a.activity.future || Number(b.competition.id === featuredId) - Number(a.competition.id === featuredId) ||
      (a.competition.position ?? 999) - (b.competition.position ?? 999) || String(a.competition.name).localeCompare(String(b.competition.name), "fr"))
    .slice(0, limit);
}
