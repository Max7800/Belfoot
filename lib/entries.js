// CRUD générique sur la table polymorphe `entries` (contenus éditoriaux).
import { supabase } from "./supabaseClient";

export async function listEntries(collection, { publishedOnly = false, order } = {}) {
  let q = supabase.from("entries").select("*").eq("collection", collection).is("deleted_at", null);
  if (publishedOnly) q = q.eq("published", true);
  q = order?.col
    ? q.order(order.col, { ascending: order.asc !== false, nullsFirst: false })
    : q.order("position", { ascending: true }).order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getEntry(collection, slug) {
  const { data } = await supabase.from("entries").select("*").eq("collection", collection).eq("slug", slug).is("deleted_at", null).maybeSingle();
  return data || null;
}

export async function saveEntry(row) {
  const payload = { ...row, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("entries").upsert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteEntry(id) {              // soft delete
  const { error } = await supabase.from("entries").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
export async function restoreEntry(id) {
  const { error } = await supabase.from("entries").update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
}
export async function hardDeleteEntry(id) {
  const { error } = await supabase.from("entries").delete().eq("id", id);
  if (error) throw error;
}

// Mapping champ déclaré -> colonne de `entries` (le reste va dans data jsonb).
export const COLUMN = { title: "title", slug: "slug", excerpt: "excerpt", body: "body", cover: "cover_url", images: "images", category: "category", published: "published", published_at: "published_at", seo: "seo" };

export function payloadToEntry(payload = {}, base = {}) {
  const row = { ...base, data: { ...(base.data || {}) } };
  for (const [k, v] of Object.entries(payload)) {
    if (COLUMN[k]) row[COLUMN[k]] = v; else row.data[k] = v;
  }
  return row;
}

export async function reorderEntries(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => supabase.from("entries").update({ position: i }).eq("id", id)));
}
