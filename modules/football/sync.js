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

// Crée ou RÉUTILISE des compétitions sans jamais violer l'index unique
// (provider, external_id). Chemin unique et sûr pour toute création de compétition
// (sélections, carrières, imports…). Retourne une Map(external_id string -> ligne).
export async function ensureCompetitions(db, provider, defs) {
  const uniq = [...new Map((defs || []).filter((d) => d && d.external_id != null).map((d) => [String(d.external_id), d])).values()];
  if (!uniq.length) return new Map();
  const ids = uniq.map((d) => String(d.external_id));
  const read = async () => {
    const { data, error } = await db.from("competitions").select("*").eq("provider", provider).in("external_id", ids);
    if (error) throw error;
    return new Map((data || []).map((r) => [String(r.external_id), r]));
  };
  let byExt = await read();
  const missing = uniq
    .filter((d) => !byExt.has(String(d.external_id)))
    .map((d) => ({ source: provider, public_visible: false, ...d, provider, external_id: String(d.external_id) }));
  if (missing.length) {
    const { error } = await db.from("competitions").insert(missing);
    if (error) {
      if (error.code !== "23505") throw new Error(`competitions: ${error.message}`);
      // Conflit dans le lot (course / doublon résiduel) -> une par une, en ignorant les doublons.
      for (const row of missing) {
        const { error: rowError } = await db.from("competitions").insert(row);
        if (rowError && rowError.code !== "23505") throw new Error(`competitions: ${rowError.message}`);
      }
    }
    byExt = await read();
  }
  return byExt;
}
