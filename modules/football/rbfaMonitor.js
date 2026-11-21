import { updateSiteSettings } from "@/lib/siteSettings";
import { parseRbfaSelection, RBFA_SELECTION_SOURCES } from "@/modules/football/rbfaSelections";
import { resolveRbfaPlayerLinks } from "@/modules/football/rbfaPlayerLinks";
import { applyRbfaCallups, atomicCallupsAvailable } from "@/modules/football/callupTransactions";

// Un changement détecté est un changement de page, pas nécessairement une annonce.
// L'application en base exige la migration et un rapprochement complet.
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
  const roster = players.map(({ sourceId, name, club, playerId }) => ({ sourceId, name, club, ...(playerId ? { playerId } : {}) }));
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

export async function monitorRbfaSelection(db, settings, { now = new Date(), fetcher = fetch, resolveLinks = resolveRbfaPlayerLinks } = {}) {
  const category = nextRbfaCategory(settings?.[RBFA_MONITOR_KEY], now.getTime());
  if (!category) return { skipped: true };
  const startedAt = now.toISOString();
  let roster = null; let failure = null; let linkError = null;
  try {
    roster = await fetchRoster(category, fetcher);
    try {
      const links = await resolveLinks(db, roster);
      roster = roster.map((person) => ({ ...person, playerId: links.get(person.sourceId) || null }));
    } catch (error) { linkError = String(error?.message || error).slice(0, 200); }
  }
  catch (error) { failure = String(error?.message || error).slice(0, 200); }
  const finishedAt = new Date().toISOString();
  const saved = await updateSiteSettings(db, (current) => {
    const state = current[RBFA_MONITOR_KEY] || {};
    const previous = state[category] || {};
    // Ne jamais écraser une observation commencée plus récemment.
    if (previous.attemptedAt && previous.attemptedAt >= startedAt) return null;
    const next = failure
      ? { ...previous, attemptedAt: startedAt, error: failure }
      : { ...observedRbfaState(previous, roster, finishedAt), attemptedAt: startedAt, linkError };
    return { [RBFA_MONITOR_KEY]: { ...state, [category]: next } };
  });
  let application = null;
  // La fonction SQL existante ne reconnaît que A et U21 ; les autres
  // catégories sont exposées comme instantanés, sans toucher aux convocations.
  if (saved && !failure && !linkError && ["senior", "u21"].includes(category)) {
    const complete = roster.every((person) => person.playerId) && new Set(roster.map((person) => person.playerId)).size === roster.length;
    if (!complete) application = { state: "identites_incompletes" };
    else {
      try {
        if (!await atomicCallupsAvailable(db)) application = { state: "migration_absente" };
        else {
          const teamExternalId = category === "senior" ? "1" : "8183";
          const team = await db.from("clubs").select("id").eq("source", "apifootball").eq("external_id", teamExternalId).eq("team_type", "national").maybeSingle();
          if (team.error || !team.data) throw team.error || new Error("Sélection belge introuvable");
          const date = new Date(finishedAt);
          const year = date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0);
          const result = await applyRbfaCallups(db, team.data.id, `${year}-${year + 1}`, finishedAt);
          application = { state: "appliquee", players: result.players, at: new Date().toISOString() };
        }
      } catch (error) { application = { state: "erreur", error: String(error?.message || error).slice(0, 200) }; }
    }
    // Une observation plus récente ne doit jamais hériter de ce résultat.
    await updateSiteSettings(db, (current) => {
      const state = current[RBFA_MONITOR_KEY] || {};
      if (state[category]?.observedAt !== finishedAt) return null;
      return { [RBFA_MONITOR_KEY]: { ...state, [category]: { ...state[category], application } } };
    });
  }
  return { category, ok: !failure && application?.state !== "erreur", superseded: !saved, error: failure, linkError, application };
}

// Trois catégories au maximum par passage : rotation équitable sans solliciter
// API-Football ni laisser les nouveaux groupes attendre plusieurs heures.
export async function monitorRbfaSelections(db, settings, { now = new Date(), limit = 3, ...options } = {}) {
  const shadow = { ...settings, [RBFA_MONITOR_KEY]: { ...(settings?.[RBFA_MONITOR_KEY] || {}) } };
  const results = [];
  for (let i = 0; i < Math.min(Math.max(limit, 1), 3); i++) {
    const category = nextRbfaCategory(shadow[RBFA_MONITOR_KEY], now.getTime());
    if (!category) break;
    const result = await monitorRbfaSelection(db, shadow, { now, ...options });
    results.push(result);
    shadow[RBFA_MONITOR_KEY][category] = { ...(shadow[RBFA_MONITOR_KEY][category] || {}), attemptedAt: now.toISOString() };
  }
  return results.length ? { results, ok: results.every((result) => result.ok) } : { skipped: true };
}
