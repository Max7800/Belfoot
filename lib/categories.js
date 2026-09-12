import { supabase } from "./supabaseClient";

export async function listCategories(scope, { activeOnly = false } = {}) {
  let q = supabase.from("categories").select("*").eq("scope", scope);
  if (activeOnly) q = q.eq("active", true);
  const { data } = await q.order("position", { ascending: true });
  return data || [];
}
export async function saveCategory(row) {
  const { data, error } = await supabase.from("categories").upsert(row).select().single();
  if (error) throw error; return data;
}
export async function deleteCategory(id) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}
// Carte { name -> color } pour colorer les pastilles au rendu public.
export async function categoryColorMap(scope) {
  const cats = await listCategories(scope);
  return Object.fromEntries(cats.map((c) => [c.name, c.color]));
}
