// Upsert des données externes SANS jamais écraser l'éditorial ni une saisie
// manuelle (`locked`). On écrit l'id externe, le payload brut (`ext`), la date de
// synchro et les seuls champs "possédés par la source".
import { supabase } from "@/lib/supabaseClient";

export async function upsertExternal(table, source, rows, ownedFields = []) {
  const now = new Date().toISOString();
  for (const r of rows) {
    // Ne pas toucher une ligne verrouillée (saisie manuelle protégée).
    const { data: existing } = await supabase.from(table).select("id,locked").eq("source", source).eq("external_id", r.external_id).maybeSingle();
    if (existing?.locked) continue;
    const patch = { source, external_id: r.external_id, ext: r.ext || r, synced_at: now };
    for (const f of ownedFields) if (r[f] !== undefined) patch[f] = r[f];
    if (existing) await supabase.from(table).update(patch).eq("id", existing.id);
    else await supabase.from(table).insert(patch);
  }
}
