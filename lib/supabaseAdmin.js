import { createClient } from "@supabase/supabase-js";
// Client SERVEUR uniquement (clé service_role). NE JAMAIS importer côté client.
// Lazy : instancié au 1er appel pour ne pas exiger la clé au build.
let _admin = null;
export function getAdmin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _admin;
}
