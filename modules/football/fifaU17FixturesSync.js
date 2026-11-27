import { updateSiteSettings } from "@/lib/siteSettings";
import { FIFA_U17_FIXTURES_KEY, FIFA_U17_FIXTURES_URL, FIFA_U17_STAGES, validFifaStage } from "@/lib/fifaU17Fixtures";

const MINUTE = 60 * 1000, MAX_BYTES = 2_000_000;
export function parseFifaU17Calendar(data) {
  if (!Array.isArray(data?.Results) || data.ContinuationToken || data.Results.length !== 104 || data.Results.some((row) => row.IdCompetition !== "102" || row.IdSeason !== "292937")) throw new Error("Calendrier FIFA incomplet ou édition incorrecte");
  const stages = {};
  for (const id of Object.keys(FIFA_U17_STAGES)) {
    const matches = data.Results.filter((row) => row.IdStage === id).map((row) => ({
      id: String(row.IdMatch || ""), kickoff: row.TimeDefined ? row.Date : null,
      home: { id: row.Home?.IdTeam, name: row.Home?.TeamName?.find((x) => x.Locale === "en-GB")?.Description },
      away: { id: row.Away?.IdTeam, name: row.Away?.TeamName?.find((x) => x.Locale === "en-GB")?.Description },
    }));
    if (validFifaStage(id, matches)) stages[id] = matches;
  }
  if (!Object.keys(stages).length) throw new Error("Aucune phase finale complète dans le calendrier FIFA");
  return stages;
}
async function readCalendar(fetcher) {
  const response = await fetcher(FIFA_U17_FIXTURES_URL, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error(`Calendrier FIFA indisponible (${response.status})`);
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Calendrier FIFA trop volumineux"); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function syncFifaU17Fixtures(db, settings, { now = new Date(), fetcher = fetch } = {}) {
  const previous = settings?.[FIFA_U17_FIXTURES_KEY] || {};
  if (now.getTime() < Date.parse("2026-11-27T00:00:00Z") || now.getTime() >= Date.parse("2026-12-28T00:00:00Z")) return { skipped: true, reason: "hors période" };
  if (now.getTime() - (Date.parse(previous.attemptedAt) || 0) < 30 * MINUTE) return { skipped: true, reason: "intervalle" };
  const attemptedAt = now.toISOString(); let stages, error;
  try { stages = parseFifaU17Calendar(await readCalendar(fetcher)); } catch (e) { error = String(e?.message || "Lecture FIFA impossible").slice(0, 200); }
  const saved = await updateSiteSettings(db, (current) => {
    const state = current[FIFA_U17_FIXTURES_KEY] || {};
    if (state.attemptedAt && state.attemptedAt >= attemptedAt) return null;
    return { [FIFA_U17_FIXTURES_KEY]: error ? { ...state, attemptedAt, error } : { attemptedAt, observedAt: attemptedAt, stages: { ...state.stages, ...stages }, stageObservedAt: { ...state.stageObservedAt, ...Object.fromEntries(Object.keys(stages).map((id) => [id, attemptedAt])) }, error: null } };
  });
  return { ok: !error, superseded: !saved, ...(error ? { error } : { stages: Object.keys(stages).length }) };
}
