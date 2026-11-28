import { updateSiteSettings } from "@/lib/siteSettings";
import { INTERNATIONAL_DRAW_EVENTS, UEFA_DRAW_SNAPSHOTS_KEY, validStoredUefaDraw } from "@/lib/internationalDrawWatch";

const HOUR = 3600000, MAX_BYTES = 2000000;
const youth = INTERNATIONAL_DRAW_EVENTS.filter((event) => event.category === "u17" || event.category === "u19");
export function parseUefaDraw(rows, event) {
  if (!Array.isArray(rows)) throw new Error("Réponse UEFA inattendue");
  const target = rows.filter((row) => String(row?.group?.roundId) === event.round);
  if (target.length !== event.groups) return null;
  const groups = [], ids = [], codes = [];
  for (const row of target) {
    const g = row.group;
    if (String(g.competitionId) !== event.uefaCompetition || String(g.seasonYear) !== event.uefaSeason || g.phase !== "QUALIFYING" || !g.id || !g.translations?.name?.FR || !Array.isArray(g.teams) || !Array.isArray(row.items) || g.teams.length !== row.items.length || g.teams.length < 3 || g.teams.length > 4) throw new Error("Groupe UEFA incohérent");
    const teams = row.items.map(({ team }) => {
      const id = String(team?.id || ""), code = String(team?.countryCode || ""), name = team?.translations?.countryName?.FR;
      if (!id || !/^[A-Z]{3}$/.test(code) || !name) throw new Error("Sélection UEFA incomplète");
      ids.push(id); codes.push(code);
      return { id, code, name };
    });
    if (new Set(g.teams.map(String)).size !== teams.length || !teams.every((team) => g.teams.map(String).includes(team.id))) throw new Error("Participants UEFA incohérents");
    groups.push({ id: String(g.id), label: g.translations.name.FR, teams });
  }
  if (ids.length !== event.teams || new Set(ids).size !== event.teams || new Set(codes).size !== event.teams || codes.filter((c) => c === "BEL").length !== 1 || new Set(groups.map((g) => g.id)).size !== event.groups) throw new Error("Tirage UEFA incomplet ou ambigu");
  return groups.sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
}
async function readStandings(event, fetcher) {
  const url = new URL("https://standings.uefa.com/v1/standings");
  url.search = new URLSearchParams({ competitionId: event.uefaCompetition, seasonYear: event.uefaSeason, phase: "QUALIFYING" }).toString();
  const response = await fetcher(url.toString(), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error(`UEFA indisponible (${response.status})`);
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Réponse UEFA trop volumineuse"); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function syncUefaYouthDraws(db, settings, { now = new Date(), fetcher = fetch } = {}) {
  const states = settings?.[UEFA_DRAW_SNAPSHOTS_KEY] || {};
  const event = youth.filter((item) => {
    const elapsed = now.getTime() - Date.parse(item.at);
    const state = states[item.id] || {};
    if (elapsed < 0 || now.getTime() >= Date.parse("2027-04-01T00:00:00Z")) return false;
    const interval = validStoredUefaDraw(item, state.groups) ? 24 * HOUR : elapsed < 48 * HOUR ? 0.5 * HOUR : 6 * HOUR;
    return now.getTime() - (Date.parse(state.attemptedAt) || 0) >= interval;
  }).sort((left, right) => {
    // Un tirage jamais essayé passe avant une nouvelle tentative. Sans ce tri,
    // un cron espacé d'au moins 30 minutes pourrait toujours choisir U19 et
    // ne jamais atteindre U17 si les deux sources restent incomplètes.
    const attempt = (item) => Date.parse(states[item.id]?.attemptedAt || "") || 0;
    return attempt(left) - attempt(right) || Date.parse(left.at) - Date.parse(right.at);
  })[0];
  if (!event) return { skipped: true, reason: "aucun tirage à relever" };
  const attemptedAt = now.toISOString(); let groups, error;
  try { groups = parseUefaDraw(await readStandings(event, fetcher), event); } catch (e) { error = String(e?.message || "Lecture UEFA impossible").slice(0, 200); }
  const saved = await updateSiteSettings(db, (current) => {
    const statesNow = current[UEFA_DRAW_SNAPSHOTS_KEY] || {}, state = statesNow[event.id] || {};
    if (state.attemptedAt && state.attemptedAt >= attemptedAt) return null;
    const next = error ? { ...state, attemptedAt, error } : groups ? { attemptedAt, observedAt: attemptedAt, groups, error: null } : { ...state, attemptedAt, error: null };
    return { [UEFA_DRAW_SNAPSHOTS_KEY]: { ...statesNow, [event.id]: next } };
  });
  return { ok: !error, superseded: !saved, event: event.id, ...(error ? { error } : groups ? { groups: groups.length } : { pending: true }) };
}
