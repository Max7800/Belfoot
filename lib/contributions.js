import { supabase } from "./supabaseClient";

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

// La validation passe exclusivement par le serveur : le payload est relu en
// base, validé, assaini et journalisé avant toute écriture dans `entries`.
export async function reviewContribution(id, action, note = "") {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Session administrateur requise.");
  const response = await fetch("/api/admin/contributions/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ id, action, note }),
  });
  if (!response.ok) throw new Error(await response.text() || "La contribution n'a pas pu être traitée.");
  return response.json();
}
