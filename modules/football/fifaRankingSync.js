import { updateSiteSettings } from "@/lib/siteSettings";

// Source documentée : Soccer Extended, FIFA Rankings. Désactivé sans clé.
const ENDPOINT = "https://api.sportradar.com/soccer-extended/production/v4/en/fifa_rankings.json";
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 512000;
export const FIFA_RANKING_STATE = "football_fifa_rankings_auto";

export function parseFifaRanking(payload) {
  const lists = payload?.rankings?.filter((r) => r?.gender === "men");
  if (!Array.isArray(lists) || lists.length !== 1) throw new Error("Classement masculin indisponible ou ambigu");
  const input = lists[0].competitor_rankings;
  if (!Array.isArray(input) || input.length < 150 || input.length > 250) throw new Error("Classement incomplet");
  const codes = new Set();
  const rows = input.map((item) => {
    const rank = item?.rank, points = item?.points, code = item?.competitor?.country_code;
    const nation = item?.competitor?.name;
    if (!Number.isInteger(rank) || rank < 1 || rank > 250 || !Number.isFinite(points) || points < 0 || typeof nation !== "string" || !nation.trim() || !/^[A-Z]{3}$/.test(code || "") || codes.has(code)) throw new Error("Ligne de classement invalide");
    codes.add(code);
    return { rank, points, code, nation: nation.trim(), isBelgium: code === "BEL" };
  }).sort((a, b) => a.rank - b.rank);
  if (!codes.has("BEL") || rows[0].rank !== 1 || rows.slice(0, 10).some((row, i) => row.rank !== i + 1)) throw new Error("Classement incohérent ou Belgique absente");
  return rows;
}

export async function syncFifaRanking(db, settings, { now = new Date(), key = process.env.SPORTRADAR_API_KEY, fetcher = fetch } = {}) {
  if (!key || settings?.football_fifa_rankings_enabled === false) return { skipped: true, reason: "non configuré" };
  const previous = settings?.[FIFA_RANKING_STATE] || {};
  if (now.getTime() - (Date.parse(previous.attemptedAt) || 0) < INTERVAL_MS) return { skipped: true, reason: "intervalle" };
  const attemptedAt = now.toISOString();
  let rows, error;
  try {
    const response = await fetcher(ENDPOINT, { headers: { "x-api-key": key }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Fournisseur indisponible (${response.status})`);
    if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Réponse trop volumineuse");
    if (!response.body) throw new Error("Réponse vide");
    const reader = response.body.getReader();
    const chunks = []; let total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) { await reader.cancel(); throw new Error("Réponse trop volumineuse"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder().decode(data);
    rows = parseFifaRanking(JSON.parse(text));
  } catch { error = "Classement indisponible ou réponse invalide"; }
  const saved = await updateSiteSettings(db, (current) => {
    const state = current[FIFA_RANKING_STATE] || {};
    if (current.football_fifa_rankings_enabled === false) return null;
    if (state.attemptedAt && state.attemptedAt >= attemptedAt) return null;
    return { [FIFA_RANKING_STATE]: error ? { ...state, attemptedAt, error } : { attemptedAt, checkedAt: attemptedAt, source: "Sportradar", entries: rows, error: null } };
  });
  return { ok: !error, superseded: !saved, ...(error ? { error } : { teams: rows.length }) };
}
