import { listEntries, saveEntry } from "./entries";

export async function exportCollectionJSON(key) {
  return JSON.stringify(await listEntries(key), null, 2);
}
export async function importCollectionJSON(key, json) {
  const rows = JSON.parse(json);
  for (const r of rows) {
    const { id, created_at, updated_at, search, deleted_at, ...rest } = r;
    await saveEntry({ ...rest, collection: key });
  }
}
export function toCSV(items) {
  if (!items.length) return "";
  const cols = Object.keys(items[0]).filter((k) => typeof items[0][k] !== "object");
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...items.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
export function download(filename, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
