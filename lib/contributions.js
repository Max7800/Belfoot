import { supabase } from "./supabaseClient";
import { payloadToEntry } from "./entries";
import { slugify } from "./slugify";

export async function submitContribution({ collection, target_id = null, kind = "create", payload }) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("Connexion requise pour proposer.");
  const { error } = await supabase.from("contributions").insert({ collection, target_id, kind, payload, submitted_by: u.user.id });
  if (error) throw error;
}

export async function listContributions(status = "pending") {
  const { data } = await supabase.from("contributions").select("*").eq("status", status).order("submitted_at", { ascending: false });
  return data || [];
}

// Accepter = appliquer le payload dans `entries` ; refuser = juste marquer.
export async function reviewContribution(c, action, note = "") {
  const { data: u } = await supabase.auth.getUser();
  if (action === "approve") {
    const base = c.kind === "edit" && c.target_id
      ? { id: c.target_id }
      : { collection: c.collection, published: true, images: [], data: {}, seo: {} };
    const row = payloadToEntry(c.payload, base);
    if (!row.slug && row.title) row.slug = slugify(row.title);
    const { error } = await supabase.from("entries").upsert(row);
    if (error) throw error;
  }
  const { error } = await supabase.from("contributions").update({
    status: action === "approve" ? "approved" : "rejected",
    reviewed_by: u?.user?.id, reviewed_at: new Date().toISOString(), note,
  }).eq("id", c.id);
  if (error) throw error;
}
