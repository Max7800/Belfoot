// Abstraction média : le stockage (Supabase aujourd'hui) est isolé ici.
// Changer de backend (S3, Cloudinary…) = ne toucher que ce fichier.
import { supabase } from "./supabaseClient";
import { compressImage } from "./compressImage";
const BUCKET = "media";

export async function uploadImage(file, opts) {
  const blob = await compressImage(file, opts);
  const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, blob, { contentType: "image/webp" });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}
export async function uploadFile(file) {   // fichiers non-image (ex. downloads FM)
  const name = `${Date.now()}-${file.name}`.replace(/[^\w.\-]/g, "_");
  const { error } = await supabase.storage.from(BUCKET).upload(name, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}
