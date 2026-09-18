// Upsert de données externes SANS écraser l'éditorial ni une saisie manuelle (locked).
// `db` = client Supabase service-role (côté serveur uniquement).
export async function upsertExternal(db, table, source, rows, ownedFields = []) {
  const now = new Date().toISOString();
  let count = 0;
  for (const r of rows) {
    if (!r.external_id) continue;
    const { data: existing, error: selectError } = await db.from(table).select("id,locked").eq("source", source).eq("external_id", r.external_id).maybeSingle();
    if (selectError) throw new Error(`${table}/${r.external_id}: ${selectError.message}`);
    if (existing?.locked) continue;                       // saisie manuelle protégée
    const patch = { source, external_id: r.external_id, ext: r.ext || r, synced_at: now };
    for (const f of ownedFields) if (r[f] !== undefined) patch[f] = r[f];
    const { error: writeError } = existing
      ? await db.from(table).update(patch).eq("id", existing.id)
      : await db.from(table).insert(patch);
    if (writeError) throw new Error(`${table}/${r.external_id}: ${writeError.message}`);
    count++;
  }
  return count;
}
