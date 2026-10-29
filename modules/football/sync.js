// Upsert de données externes SANS écraser l'éditorial ni une saisie manuelle (locked).
// `db` = client Supabase service-role (côté serveur uniquement).
import { frenchTeamName } from "@/lib/frenchNations";
import { frenchCompetitionName } from "@/lib/frenchCompetitions";
import { frenchClubName } from "@/lib/frenchClubs";

// Sélections nommées en français à l'écriture (« Spain U21 » → « Espagne U21 »),
// quel que soit le job : l'API renvoie les noms anglais à chaque passage et
// écrasait le nom français posé par syncNationalTeam.
// Clubs en français aussi (lib/frenchClubs.js, 30/10/2026) : « Standard Liege » →
// « Standard de Liège ». Appliqué à chaque écriture, l'API renvoyant l'anglais à chaque passage.
export const storedClubName = (table, name) => (table === "clubs" && typeof name === "string" ? frenchClubName(frenchTeamName(name)) : name);

// Références manquantes (clubs…) insérées avec leurs champs ; celles qui existent
// déjà ne sont jamais modifiées (un nom français posé à la main est conservé).
export async function ensureExternalReferences(db, table, source, rows) {
  const uniqueRows = [...new Map((rows || []).filter((row) => row.external_id).map((row) => [String(row.external_id), row])).values()];
  if (!uniqueRows.length) return;
  const { data: existing, error: existingError } = await db.from(table).select("external_id").eq("source", source).in("external_id", uniqueRows.map((row) => String(row.external_id)));
  if (existingError) throw existingError;
  const known = new Set((existing || []).map((row) => String(row.external_id)));
  const missing = uniqueRows.filter((row) => !known.has(String(row.external_id))).map((row) => ({ ...row, source, ...(row.name !== undefined ? { name: storedClubName(table, row.name) } : {}) }));
  if (missing.length) {
    const { error } = await db.from(table).insert(missing);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}
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

// Supabase (PostgREST) plafonne chaque réponse (« Max rows », 1 000 par défaut)
// SANS signaler d'erreur. Charger « toute la table » pour construire une
// correspondance external_id -> id perd donc silencieusement des lignes dès que
// la table grandit. On ne lit que les identifiants demandés, par paquets dont la
// taille reste toujours sous ce plafond (une ligne au plus par external_id).
export async function loadByExternalIds(db, table, source, externalIds, columns = "id,external_id") {
  const ids = [...new Set((externalIds || []).filter((value) => value !== null && value !== undefined && value !== "").map(String))];
  const byExternalId = new Map();
  for (const batch of chunks(ids, 100)) {
    const { data, error } = await db.from(table).select(columns).eq("source", source).in("external_id", batch);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of data || []) byExternalId.set(String(row.external_id), row);
  }
  return byExternalId;
}

// Variante { external_id: id } pour les appelants qui indexent un objet simple.
export async function idMapByExternalIds(db, table, source, externalIds) {
  const rows = await loadByExternalIds(db, table, source, externalIds);
  return Object.fromEntries([...rows.entries()].map(([externalId, row]) => [externalId, row.id]));
}

// Lit TOUTES les lignes d'une requête, page par page. `buildQuery` doit renvoyer
// une requête neuve et triée de façon stable. On avance du nombre de lignes
// réellement reçues et on s'arrête sur une page vide : le résultat reste complet
// même si le plafond serveur est inférieur à la taille de page demandée.
export async function selectAllPages(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; ) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
    from += data.length;
  }
}

// Fusion de `ext` : les clés du provider s'ajoutent ou se mettent à jour, mais
// une valeur absente (null/undefined) n'efface jamais une valeur connue, et les
// clés que le provider ne renvoie pas (ex. country, imported_for) sont gardées.
export function mergeExt(existing, incoming) {
  const merged = { ...(existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value !== null && value !== undefined) merged[key] = value;
  }
  return merged;
}

// extMode :
//   "replace" (défaut) : ext = payload provider complet (matchs, entraîneurs…) ;
//   "merge"            : ext existant complété par le payload (fiches clubs) ;
//   "keep"             : ext existant conservé tel quel ; payload seulement à la
//                        création (lignes minimales dérivées d'un match, qui
//                        écrasaient sinon le pays du club).
export async function upsertExternal(db, table, source, rows, ownedFields = [], { extMode = "replace" } = {}) {
  if (!["replace", "merge", "keep"].includes(extMode)) throw new Error(`upsertExternal: extMode inconnu ${extMode}`);
  const now = new Date().toISOString();
  const uniqueRows = [...new Map((rows || []).filter((row) => row.external_id).map((row) => [String(row.external_id), row])).values()];
  const existingByExternalId = new Map();
  const columns = extMode === "merge" ? "id,locked,external_id,ext" : "id,locked,external_id";
  for (const ids of chunks(uniqueRows.map((row) => String(row.external_id)), 75)) {
    const { data, error } = await db.from(table).select(columns).eq("source", source).in("external_id", ids);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const existing of data || []) existingByExternalId.set(String(existing.external_id), existing);
  }

  const inserts = [];
  const updates = [];
  for (const r of uniqueRows) {
    const existing = existingByExternalId.get(String(r.external_id));
    if (existing?.locked) continue;
    const incomingExt = r.ext || r;
    const patch = { source, external_id: r.external_id, synced_at: now };
    if (!existing || extMode === "replace") patch.ext = incomingExt;
    else if (extMode === "merge") patch.ext = mergeExt(existing.ext, incomingExt);
    for (const f of ownedFields) if (r[f] !== undefined) patch[f] = r[f];
    if (patch.name !== undefined) patch.name = storedClubName(table, patch.name);
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

// Code stable d'une collision : `runJob` le conserve dans job_runs.params.error_code
// (la classe de l'erreur ne survit pas à la journalisation), ce qui permet au cron
// des sélections de reconnaître un échec qui se reproduira à l'identique.
export const COMPETITION_COLLISION = "COMPETITION_COLLISION";

// Collision entre une compétition demandée et la base : la correspondance est
// incertaine, aucune fiche n'est créée ni réutilisée pour les ligues en cause.
// `collisions` détaille chaque cas (identifiant API, slug, fiches en cause) pour
// un diagnostic sans relecture. Le message ne parle que des compétitions :
// l'appelant précise ce qu'il a éventuellement déjà écrit par ailleurs.
export class CompetitionCollisionError extends Error {
  constructor(collisions) {
    const describe = (item) => `ligue ${item.externalId}${item.slug ? ` (slug ${item.slug})` : ""} : ${item.reason}${item.rows.length ? ` [${item.rows.map((row) => `${row.id} « ${row.name || "?"} » ${row.source || "?"}/${row.provider || "?"}:${row.external_id ?? "?"}`).join(" ; ")}]` : ""}`;
    super(`Collision de compétitions, correspondance incertaine (aucune fiche créée ni réutilisée pour ces ligues) : ${collisions.map(describe).join(" · ")}`);
    this.name = "CompetitionCollisionError";
    this.code = COMPETITION_COLLISION;
    this.collisions = collisions;
  }
}

const COLLISION_FIELDS = "id,name,slug,source,provider,external_id";

// `provider` non renseigné : null, ou chaîne vide (valeur enregistrée par
// l'éditeur d'administration quand le champ texte est vidé).
const blankProvider = (value) => value === null || value === undefined || String(value).trim() === "";

// Une fiche correspond à une ligue du provider si elle est déclarée pour ce
// provider, ou si son `provider` est vide mais sa `source` est ce provider.
function ownedByProvider(row, provider) {
  return row.provider === provider || (blankProvider(row.provider) && row.source === provider);
}

// Classe chaque définition : fiche existante réutilisable, création possible,
// ou collision (plusieurs fiches pour un identifiant, fiche d'un autre provider
// sur la même source, slug déjà pris par une autre ligue). Le nom n'est jamais
// une clé : deux compétitions homonymes restent distinctes par leur identifiant.
async function classifyCompetitions(db, provider, defs) {
  const ids = defs.map((d) => String(d.external_id));
  const slugs = [...new Set(defs.map((d) => d.slug).filter(Boolean))];
  const [byProvider, bySource, bySlug] = await Promise.all([
    db.from("competitions").select("*").eq("provider", provider).in("external_id", ids),
    db.from("competitions").select("*").eq("source", provider).in("external_id", ids),
    slugs.length ? db.from("competitions").select(COLLISION_FIELDS).in("slug", slugs) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [byProvider, bySource, bySlug]) if (result.error) throw new Error(`competitions: ${result.error.message}`);
  const candidates = new Map();
  for (const row of [...(byProvider.data || []), ...(bySource.data || [])]) candidates.set(row.id, row);
  const rowsByExternalId = new Map();
  for (const row of candidates.values()) {
    const key = String(row.external_id);
    rowsByExternalId.set(key, [...(rowsByExternalId.get(key) || []), row]);
  }
  const existing = new Map();
  const toCreate = [];
  const collisions = [];
  const brief = (row) => ({ id: row.id, name: row.name, slug: row.slug, source: row.source, provider: row.provider, external_id: row.external_id });
  for (const def of defs) {
    const externalId = String(def.external_id);
    const rows = rowsByExternalId.get(externalId) || [];
    if (rows.length > 1) { collisions.push({ externalId, slug: def.slug || null, reason: "plusieurs fiches portent cet identifiant", rows: rows.map(brief) }); continue; }
    if (rows.length === 1) {
      if (ownedByProvider(rows[0], provider)) existing.set(externalId, rows[0]);
      else collisions.push({ externalId, slug: def.slug || null, reason: `fiche déclarée pour un autre provider (${rows[0].provider || "source " + rows[0].source})`, rows: [brief(rows[0])] });
      continue;
    }
    const slugOwners = def.slug ? (bySlug.data || []).filter((row) => row.slug === def.slug) : [];
    if (slugOwners.length) { collisions.push({ externalId, slug: def.slug, reason: "slug déjà utilisé par une autre compétition", rows: slugOwners.map(brief) }); continue; }
    toCreate.push(def);
  }
  return { existing, toCreate, collisions };
}

// Crée ou RÉUTILISE des compétitions sans jamais ignorer une erreur d'unicité
// (index (source, external_id) et slug). Chemin unique pour toute création de
// compétition (sélections, carrières, imports…). Retourne une
// Map(external_id string -> ligne) complète, ou lève CompetitionCollisionError
// AVANT toute insertion si une correspondance est incertaine.
export async function ensureCompetitions(db, provider, defs) {
  const uniq = [...new Map((defs || []).filter((d) => d && d.external_id != null).map((d) => [String(d.external_id), d])).values()];
  if (!uniq.length) return new Map();
  const first = await classifyCompetitions(db, provider, uniq);
  if (first.collisions.length) throw new CompetitionCollisionError(first.collisions);
  const byExt = new Map(first.existing);
  // Nom français dès la création (lib/frenchCompetitions.js) ; une fiche existante n'est jamais renommée.
  const rowsToInsert = first.toCreate.map((d) => ({ source: provider, public_visible: false, ...d, name: frenchCompetitionName(d.name, d.ext?.country), provider, external_id: String(d.external_id) }));
  if (rowsToInsert.length) {
    const { error } = await db.from("competitions").insert(rowsToInsert);
    if (error && error.code !== "23505") throw new Error(`competitions: ${error.message}`);
    if (error) {
      // Violation d'unicité : soit une autre synchronisation vient de créer la
      // même ligue (course, réutilisable), soit une collision est apparue
      // entre-temps. On reclasse ligne par ligne au lieu d'ignorer l'erreur.
      for (const row of rowsToInsert) {
        const { error: rowError } = await db.from("competitions").insert(row);
        if (rowError && rowError.code !== "23505") throw new Error(`competitions: ${rowError.message}`);
        if (rowError) {
          const retry = await classifyCompetitions(db, provider, [row]);
          if (retry.collisions.length || !retry.existing.has(row.external_id)) {
            throw new CompetitionCollisionError(retry.collisions.length ? retry.collisions : [{ externalId: row.external_id, slug: row.slug || null, reason: `insertion refusée par la base (${rowError.message}) sans fiche réutilisable`, rows: [] }]);
          }
        }
      }
    }
  }
  // Relecture finale : chaque ligue demandée doit désigner exactement une fiche.
  const final = await classifyCompetitions(db, provider, uniq);
  if (final.collisions.length) throw new CompetitionCollisionError(final.collisions);
  for (const [externalId, row] of final.existing) byExt.set(externalId, row);
  const unresolved = uniq.filter((d) => !byExt.has(String(d.external_id)));
  if (unresolved.length) throw new CompetitionCollisionError(unresolved.map((d) => ({ externalId: String(d.external_id), slug: d.slug || null, reason: "fiche introuvable après création", rows: [] })));
  return byExt;
}
