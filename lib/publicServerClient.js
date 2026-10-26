import { createClient } from "@supabase/supabase-js";

// Lecture PUBLIQUE côté serveur (clé anon, aucune session) : métadonnées des
// pages. Sans configuration (build local sans variables), null : les pages
// gardent alors leurs métadonnées génériques.
let client;
export function publicServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^https:\/\//.test(url)) return null;
  client ||= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

// Lecture qui ne casse jamais une page : en cas d'erreur, valeur de repli.
export async function safeRead(read, fallback = null) {
  try { return (await read()) ?? fallback; } catch { return fallback; }
}
