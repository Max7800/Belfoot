// Interactions transverses : marchent sur tout contenu via (target_type, target_id).
import { supabase } from "./supabaseClient";

export async function listComments(target_type, target_id) {
  const { data } = await supabase.from("comments").select("*").eq("target_type", target_type).eq("target_id", target_id).is("deleted_at", null).order("created_at");
  return data || [];
}
export async function addComment(target_type, target_id, body) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("comments").insert({ target_type, target_id, body, author: u?.user?.id });
  if (error) throw error;
}
export async function vote(target_type, target_id, value = 1) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("votes").upsert({ target_type, target_id, value, voter: u?.user?.id }, { onConflict: "target_type,target_id,voter" });
  if (error) throw error;
}
export async function voteScore(target_type, target_id) {
  const { data } = await supabase.from("votes").select("value").eq("target_type", target_type).eq("target_id", target_id);
  return (data || []).reduce((s, v) => s + v.value, 0);
}
export async function report(target_type, target_id, reason) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("reports").insert({ target_type, target_id, reason, reporter: u?.user?.id });
  if (error) throw error;
}
