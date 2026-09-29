// Upsert de données externes SANS écraser l'éditorial ni une saisie manuelle (locked).
// `db` = client Supabase service-role (côté serveur uniquement).
function chunks(values, size) {
  const out = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

async function mapWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(workers);
}

export async function upsertExternal(db, table, source, rows, ownedFields = []) {
  const now = new Date().toISOString();
  const uniqueRows = [...new Map((rows || []).filter((row) => row.external_id).map((row) => [String(row.external_id), row])).values()];
  const existingByExternalId = new Map();
  for (const ids of chunks(uniqueRows.map((row) => String(row.external_id)), 75)) {
    const { data, error } = await db.from(table).select("id,locked,external_id").eq("source", source).in("external_id", ids);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const existing of data || []) existingByExternalId.set(String(existing.external_id), existing);
  }

  const inserts = [];
  const updates = [];
  for (const r of uniqueRows) {
    const existing = existingByExternalId.get(String(r.external_id));
    if (existing?.locked) continue;
    const patch = { source, external_id: r.external_id, ext: r.ext || r, synced_at: now };
    for (const f of ownedFields) if (r[f] !== undefined) patch[f] = r[f];
    if (existing) updates.push({ id: existing.id, externalId: r.external_id, patch });
    else inserts.push(patch);
  }

  await mapWithConcurrency(updates, 12, async ({ id, externalId, patch }) => {
    const { error } = await db.from(table).update(patch).eq("id", id);
    if (error) throw new Error(`${table}/${externalId}: ${error.message}`);
  });

  // PostgREST exige des clés homogènes pour une insertion multiple. On groupe
  // donc les payloads avant de les envoyer par lots sans remplir les champs
  // absents avec null, ce qui préserverait mal les valeurs par défaut.
  const insertGroups = new Map();
  for (const patch of inserts) {
    const signature = Object.keys(patch).sort().join("|");
    const group = insertGroups.get(signature) || [];
    group.push(patch);
    insertGroups.set(signature, group);
  }
  for (const group of insertGroups.values()) {
    for (const batch of chunks(group, 100)) {
      const { error } = await db.from(table).insert(batch);
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }
  return inserts.length + updates.length;
}
