import { updateSiteSettings } from "@/lib/siteSettings";
import { parseRbfaSelection, RBFA_SELECTION_SOURCES } from "@/modules/football/rbfaSelections";

// Un changement détecté est un changement de page, pas nécessairement une annonce.
// Les listes ne sont jamais appliquées aux convocations depuis ce module.
export const RBFA_MONITOR_KEY = "football_rbfa_monitor";
const INTERVAL = 60 * 60 * 1000;
const MAX_BYTES = 512000;

export function nextRbfaCategory(state = {}, now = Date.now()) {
  return Object.keys(RBFA_SELECTION_SOURCES)
    .map((category) => ({ category, attempted: Date.parse(state[category]?.attemptedAt) || 0 }))
    .filter(({ attempted }) => now - attempted >= INTERVAL)
    .sort((a, b) => a.attempted - b.attempted)[0]?.category || null;
}

export function observedRbfaState(previous, players, observedAt) {
  const roster = players.map(({ sourceId, name, club }) => ({ sourceId, name, club }));
  const ids = (rows) => rows.map((person) => person.sourceId).sort().join(",");
  const changed = !!previous?.players && ids(previous.players) !== ids(roster);
  const history = changed
    ? [{ observedAt: previous.observedAt, players: previous.players }, ...(previous.history || [])].slice(0, 3)
    : (previous?.history || []);
  return { attemptedAt: observedAt, observedAt, changedAt: changed ? observedAt : previous?.changedAt || null, players: roster, history, error: null };
}

async function fetchRoster(category, fetcher) {
  const response = await fetcher(RBFA_SELECTION_SOURCES[category], { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok || !response.body) throw new Error("Source RBFA indisponible");
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Document RBFA trop volumineux");
  const reader = response.body.getReader();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw new Error("Document RBFA trop volumineux"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return parseRbfaSelection(new TextDecoder("windows-1252").decode(bytes));
}

export async function monitorRbfaSelection(db, settings, { now = new Date(), fetcher = fetch } = {}) {
  const category = nextRbfaCategory(settings?.[RBFA_MONITOR_KEY], now.getTime());
  if (!category) return { skipped: true };
  const startedAt = now.toISOString();
  let roster = null; let failure = null;
  try { roster = await fetchRoster(category, fetcher); }
  catch (error) { failure = String(error?.message || error).slice(0, 200); }
  const finishedAt = new Date().toISOString();
  const saved = await updateSiteSettings(db, (current) => {
    const state = current[RBFA_MONITOR_KEY] || {};
    const previous = state[category] || {};
    // Ne jamais écraser une observation commencée plus récemment.
    if (previous.attemptedAt && previous.attemptedAt >= startedAt) return null;
    const next = failure
      ? { ...previous, attemptedAt: startedAt, error: failure }
      : { ...observedRbfaState(previous, roster, finishedAt), attemptedAt: startedAt };
    return { [RBFA_MONITOR_KEY]: { ...state, [category]: next } };
  });
  return { category, ok: !failure, superseded: !saved, error: failure };
}
