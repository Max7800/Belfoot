import { supabase } from "./supabaseClient";

// Sujet lié à une entité (match/article/joueur/club) via ref_type + ref_id.
export async function getRefTopic(refType, refId) {
  if (!refType || !refId) return null;
  const { data } = await supabase.from("forum_topics").select("id").eq("ref_type", refType).eq("ref_id", refId).maybeSingle();
  return data?.id || null;
}

// Crée le sujet lié (réservé membre connecté via RLS author = auth.uid()).
export async function startRefTopic({ refType, refId, title, userId, categorySlug, firstMessage }) {
  const { data: prof } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
  const author_name = prof?.username || "Membre";
  let categoryId = null;
  if (categorySlug) {
    const { data: cat } = await supabase.from("forum_categories").select("id").eq("slug", categorySlug).maybeSingle();
    categoryId = cat?.id || null;
  }
  const { data: topic, error } = await supabase.from("forum_topics")
    .insert({ category_id: categoryId, author: userId, title, author_name, ref_type: refType, ref_id: refId })
    .select("id").single();
  if (error) throw error;
  if (firstMessage) await supabase.from("forum_posts").insert({ topic_id: topic.id, author: userId, body: firstMessage, author_name });
  return topic.id;
}
