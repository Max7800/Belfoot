import { updateSiteSettings } from "@/lib/siteSettings";
import { UEFA_U21_DRAW_KEY, UEFA_U21_DRAW_SOURCE, UEFA_U21_START, validU21Draw } from "@/lib/uefaDraw";
const DAY = 24 * 60 * 60 * 1000;
const MAX_BYTES = 2_000_000;
export function parseU21Draw(html) {
  if (!/2027 Under 21 EURO final draw made/i.test(html)) throw new Error("Article UEFA inattendu");
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1].replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim());
  const groups = "ABCD".split("").map((letter) => {
    const found = paragraphs.filter((p) => new RegExp(`^Group\\s+${letter}\\s*:`, "i").test(p));
    if (found.length !== 1) throw new Error(`Groupe ${letter} absent ou ambigu`);
    return { label: `Group ${letter}`, teams: found[0].replace(/^Group\s+[A-D]\s*:\s*/i, "").split(",").map((name) => name.replace(/\s*\([^)]*\)/g, "").trim()) };
  });
  if (!validU21Draw(groups)) throw new Error("Tirage UEFA incomplet ou incohérent");
  return groups;
}
async function readPage(fetcher) {
  const response = await fetcher(UEFA_U21_DRAW_SOURCE, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error(`Source UEFA indisponible (${response.status})`);
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Page UEFA trop volumineuse"); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
export async function syncU21Draw(db, settings, { now = new Date(), fetcher = fetch } = {}) {
  const previous = settings?.[UEFA_U21_DRAW_KEY] || {};
  if (now.getTime() >= UEFA_U21_START && validU21Draw(previous.groups)) return { skipped: true, reason: "tournoi commencé" };
  if (now.getTime() - (Date.parse(previous.attemptedAt) || 0) < DAY) return { skipped: true, reason: "intervalle" };
  const attemptedAt = now.toISOString(); let groups, error;
  try { groups = parseU21Draw(await readPage(fetcher)); } catch (e) { error = String(e?.message || "Lecture UEFA impossible").slice(0, 200); }
  const saved = await updateSiteSettings(db, (current) => {
    const state = current[UEFA_U21_DRAW_KEY] || {};
    if (state.attemptedAt && state.attemptedAt >= attemptedAt) return null;
    return { [UEFA_U21_DRAW_KEY]: error ? { ...state, attemptedAt, error } : { attemptedAt, observedAt: attemptedAt, source: UEFA_U21_DRAW_SOURCE, groups, error: null } };
  });
  return { ok: !error, superseded: !saved, ...(error ? { error } : { groups: groups.length }) };
}
