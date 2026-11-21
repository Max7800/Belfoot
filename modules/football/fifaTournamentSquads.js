import { updateSiteSettings } from "@/lib/siteSettings";
import { FIFA_U17_KEY, FIFA_U17_ARCHIVE_AFTER } from "@/lib/fifaTournamentRoster";
export { FIFA_U17_KEY } from "@/lib/fifaTournamentRoster";

export const FIFA_U17_SOURCE = "https://fdp.fifa.org/assetspublic/ce303/pdf/SquadLists-English.pdf";
const MAX_BYTES = 3_000_000;
const DAY = 24 * 60 * 60 * 1000;
const POSITION = { GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Attacker" };
const title = (value) => value.toLocaleLowerCase("fr-BE").replace(/(^|[\s'-])\p{L}/gu, (m) => m.toLocaleUpperCase("fr-BE"));

// Les cellules de chaque ligne sont triées par leur position horizontale ; toute structure inconnue est rejetée.
export function parseBelgiumPage(items) {
  const words = items.filter((item) => typeof item.str === "string" && item.str.trim()).map((item) => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }));
  if (!words.some((w) => /^Belgium\s*\(BEL\)$/i.test(w.text)) || !words.some((w) => w.text.includes("FIFA U-17 World Cup Qatar 2026"))) throw new Error("Page Belgique ou compétition incorrecte");
  const headers = ["#", "POS", "PLAYER NAME", "FIRST NAME(S)", "LAST NAME(S)", "NAME ON SHIRT", "DOB", "CLUB", "HEIGHT (CM)"].map((label) => words.find((w) => w.text === label));
  if (headers.some((h) => !h) || headers.some((h, i) => i && h.x <= headers[i - 1].x)) throw new Error("Colonnes FIFA inconnues");
  const baseY = headers[0].y;
  const footer = words.find((w) => /\bVersion\s+\d+\s*\|\s*Page\s+\d+/i.test(w.text))?.text;
  const stamp = footer?.match(/(\d{1,2} [A-Za-z]+ \d{4})\s*\|\s*(\d{2}:\d{2}) UTC\s*\|\s*Version\s+(\d+)/i);
  const versionTime = stamp ? Date.parse(`${stamp[1]} ${stamp[2]} UTC`) : NaN;
  if (!Number.isFinite(versionTime)) throw new Error("Version FIFA absente ou invalide");
  const numberWords = words.filter((w) => w.y < baseY && w.x < headers[1].x - 1 && /^\d{1,2}$/.test(w.text));
  const rows = numberWords.map((number) => {
    const cells = words.filter((w) => Math.abs(w.y - number.y) < 0.8).sort((a, b) => a.x - b.x).map((w) => w.text);
    if (cells.length !== headers.length || cells[0] !== number.text) throw new Error("Structure de ligne FIFA inconnue");
    const shirt = Number(number.text), position = POSITION[cells[1]], first = cells[3], surname = cells[4], birth = cells[6], club = cells[7];
    const birthMatch = birth.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!position || !first || !surname || !club || !birthMatch) throw new Error(`Ligne FIFA ${shirt} invalide`);
    const birthDate = `${birthMatch[3]}-${birthMatch[2]}-${birthMatch[1]}`;
    if (new Date(birthDate).toISOString().slice(0, 10) !== birthDate) throw new Error("Date FIFA invalide");
    return { sourceId: `fifa-u17-2026-${shirt}`, shirt, name: `${first.split(/\s+/)[0]} ${title(surname)}`, position, birthDate, club };
  }).sort((a, b) => a.shirt - b.shirt);
  if (rows.length !== 21 || new Set(rows.map((p) => p.shirt)).size !== rows.length || rows.some((p, i) => p.shirt !== i + 1) || new Set(rows.map((p) => `${p.name}|${p.birthDate}`)).size !== rows.length) throw new Error("Liste FIFA incomplète ou ambiguë");
  return { players: rows, version: footer, versionAt: new Date(versionTime).toISOString(), versionNumber: Number(stamp[3]) };
}

export async function readBelgiumPdf(bytes) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Inclure explicitement le worker : le bundle serveur Next ne copie pas
  // forcément le fichier chargé dynamiquement par PDF.js.
  globalThis.pdfjsWorker ||= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true, isEvalSupported: false });
  try {
    const pdf = await task.promise;
    if (pdf.numPages < 1 || pdf.numPages > 70) throw new Error("Document FIFA inattendu");
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      if (content.items.some((item) => /^Belgium\s*\(BEL\)$/i.test(item.str?.trim() || ""))) return parseBelgiumPage(content.items);
    }
    throw new Error("Liste Belgique absente du document FIFA");
  } finally { await task.destroy(); }
}

export async function syncFifaTournamentSquad(db, settings, { now = new Date(), fetcher = fetch, reader = readBelgiumPdf } = {}) {
  if (now.getTime() >= FIFA_U17_ARCHIVE_AFTER) return { skipped: true, reason: "tournoi archivé" };
  const previous = settings?.[FIFA_U17_KEY] || {};
  if (now.getTime() - (Date.parse(previous.attemptedAt) || 0) < DAY) return { skipped: true, reason: "intervalle" };
  const attemptedAt = now.toISOString(); let snapshot, error;
  try {
    const response = await fetcher(FIFA_U17_SOURCE, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Document FIFA indisponible");
    const stream = response.body.getReader(), chunks = []; let total = 0;
    try { for (;;) { const { value, done } = await stream.read(); if (done) break; total += value.byteLength; if (total > MAX_BYTES) { await stream.cancel(); throw new Error("Document FIFA trop volumineux"); } chunks.push(value); } } finally { stream.releaseLock(); }
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    snapshot = await reader(bytes);
    if (!Number.isFinite(Date.parse(snapshot.versionAt)) || Date.parse(snapshot.versionAt) > now.getTime() + 3600000) throw new Error("Date FIFA invalide ou future");
    if (previous.versionAt && Date.parse(snapshot.versionAt) < Date.parse(previous.versionAt)) throw new Error("Version FIFA plus ancienne");
  } catch (e) { error = String(e?.message || "Lecture FIFA impossible").slice(0, 200); }
  const saved = await updateSiteSettings(db, (current) => {
    const state = current[FIFA_U17_KEY] || {};
    if (state.attemptedAt && state.attemptedAt >= attemptedAt) return null;
    if (!error && state.versionAt && Date.parse(snapshot.versionAt) < Date.parse(state.versionAt)) return null;
    return { [FIFA_U17_KEY]: error ? { ...state, attemptedAt, error } : { attemptedAt, observedAt: attemptedAt, source: FIFA_U17_SOURCE, ...snapshot, error: null } };
  });
  return { ok: !error, superseded: !saved, ...(error ? { error } : { players: snapshot.players.length, version: snapshot.version }) };
}
