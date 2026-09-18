// Abstraction média : le stockage (Supabase aujourd'hui) est isolé ici.
// Changer de backend (S3, Cloudinary…) = ne toucher que ce fichier.
import { supabase } from "./supabaseClient";
import { compressImage } from "./compressImage";
const BUCKET = "media";
const INPUT_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_SIZE = 15 * 1024 * 1024;
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const UPLOAD_SCOPES = new Set(["admin", "contributions"]);

export async function uploadImage(file, { scope = "admin", ...compression } = {}) {
  if (!file || !INPUT_MIME.has(file.type)) throw new Error("Format refusé. Utilise JPG, PNG ou WebP.");
  if (file.size > MAX_INPUT_SIZE) throw new Error("Image trop lourde (15 Mo maximum avant compression).");
  if (!UPLOAD_SCOPES.has(scope)) throw new Error("Dossier d'upload invalide.");

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) throw new Error("Connexion requise pour envoyer une image.");

  const blob = await compressImage(file, compression);
  if (!blob) throw new Error("La compression de l'image a échoué.");
  if (blob.size > MAX_UPLOAD_SIZE) throw new Error("Image encore trop lourde après compression (5 Mo maximum).");

  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const name = `${scope}/${authData.user.id}/${id}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, blob, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}
