import { updateSiteSettings } from "@/lib/siteSettings";

const PAGE = "https://inside.fifa.com/fifa-rankings/world-ranking/men";
const API = "https://inside.fifa.com/api/live-world-ranking/get-rankings";
const DAY = 24 * 60 * 60 * 1000;
const MAX_BYTES = 2_000_000;
export const FIFA_RANKING_STATE = "football_fifa_rankings_auto";

// Read the dated official editions published in the page, not the live ranking.
export function parseFifaSchedule(html, now = new Date()) {
  const match = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Calendrier FIFA introuvable");
  const data = JSON.parse(match[1]);
  const groups = data?.props?.pageProps?.pageData?.ranking?.dates;
  if (!Array.isArray(groups)) throw new Error("Calendrier FIFA invalide");
  const editions = groups.flatMap((group) => Array.isArray(group?.dates) ? group.dates : [])
    .filter((item) => /^(?:FRS_Male_Football_\d{8}|id\d+)$/.test(item?.id || "") && Number.isFinite(Date.parse(item?.iso)) && Date.parse(item.iso) <= now.getTime())
    .sort((a, b) => Date.parse(b.iso) - Date.parse(a.iso));
  if (!editions.length) throw new Error("Aucune édition officielle disponible");
  return { id: editions[0].id, publishedAt: new Date(editions[0].iso).toISOString() };
}

export function parseFifaRanking(payload) {
  const input = payload?.rankings;
  if (!Array.isArray(input) || !Number.isInteger(payload?.total) || payload.total !== input.length || input.length < 150 || input.length > 250) throw new Error("Classement incomplet");
  const codes = new Set();
  const rows = input.map((item) => {
    const { rank, totalPoints: points, countryCode: code, teamName: nation } = item || {};
    if (!Number.isInteger(rank) || rank < 1 || rank > 250 || !Number.isFinite(points) || points < 0 || typeof nation !== "string" || !nation.trim() || !/^[A-Z]{3}$/.test(code || "") || codes.has(code)) throw new Error("Ligne FIFA invalide");
    codes.add(code);
    return { rank, points: Math.round(points * 100) / 100, code, nation: nation.trim(), isBelgium: code === "BEL" };
  }).sort((a, b) => a.rank - b.rank);
  if (!codes.has("BEL") || rows.some((row, index) => index === 0 ? row.rank !== 1 : row.rank !== rows[index - 1].rank && row.rank !== index + 1) || rows.some((row, index) => index > 0 && row.points > rows[index - 1].points + 0.01)) throw new Error("Classement FIFA incohérent");
  return rows;
}

async function getText(url, fetcher) {
  const response = await fetcher(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error(`Source FIFA indisponible (${response.status})`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Réponse FIFA trop volumineuse");
  const reader = response.body.getReader(); const chunks = []; let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); throw new Error("Réponse FIFA trop volumineuse"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function syncFifaRanking(db, settings, { now = new Date(), fetcher = fetch } = {}) {
  if (settings?.football_fifa_rankings_enabled === false) return { skipped: true, reason: "désactivé" };
  const previous = settings?.[FIFA_RANKING_STATE] || {};
  if (now.getTime() - (Date.parse(previous.attemptedAt) || 0) < DAY) return { skipped: true, reason: "intervalle" };
  const attemptedAt = now.toISOString();
  let edition, rows, error;
  try {
    edition = parseFifaSchedule(await getText(PAGE, fetcher), now);
    if (previous.publishedAt && Date.parse(edition.publishedAt) < Date.parse(previous.publishedAt)) throw new Error("Édition plus ancienne que le snapshot enregistré");
    {
      const url = new URL(API);
      for (const [key, value] of Object.entries({ mode: "schedule", gender: "1", locale: "en-GB", scheduleId: edition.id, count: "300", rankingType: "0" })) url.searchParams.set(key, value);
      rows = parseFifaRanking(JSON.parse(await getText(url.toString(), fetcher)));
    }
  } catch (e) { error = String(e?.message || "Source FIFA indisponible").slice(0, 200); }
  const saved = await updateSiteSettings(db, (current) => {
    const state = current[FIFA_RANKING_STATE] || {};
    if (current.football_fifa_rankings_enabled === false || (state.attemptedAt && state.attemptedAt >= attemptedAt)) return null;
    if (error) return { [FIFA_RANKING_STATE]: { ...state, attemptedAt, error } };
    if (state.publishedAt && Date.parse(edition.publishedAt) < Date.parse(state.publishedAt)) return null;
    return { [FIFA_RANKING_STATE]: { ...state, attemptedAt, checkedAt: attemptedAt, publishedAt: edition.publishedAt, scheduleId: edition.id, source: "FIFA", entries: rows || state.entries, error: null } };
  });
  return { ok: !error, superseded: !saved, ...(error ? { error } : { teams: rows?.length || previous.entries?.length, publishedAt: edition.publishedAt }) };
}
