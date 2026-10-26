// Lecture COMPLÈTE d'une requête Supabase / PostgREST.
//
// Supabase plafonne chaque lecture à 1 000 lignes SANS erreur : une requête
// qui en renvoie plus est tronquée en silence (constaté le 26/10/2026 sur les
// pages de compétition : stats de saison, performances par match et effectifs
// des coupes d'Europe lus à 1 000 lignes sur 1 700 à 4 800).
//
// `buildQuery` reconstruit la requête à chaque page (un builder PostgREST ne
// se réutilise pas). Ordre stable : `id` est ajouté en dernier critère, pour
// que les pages ne se chevauchent pas. Même forme de retour que Supabase
// ({ data, error }) : les appels existants n'ont rien d'autre à changer.
export const READ_PAGE_SIZE = 1000;
const MAX_ROWS = 50000;
// Dépassement du délai d'exécution côté base (PostgreSQL 57014) : ponctuel sur
// la petite instance quand une page lit beaucoup en même temps que le cron
// écrit (constaté le 26/10 sur la page Ligue des champions) → nouvel essai.
const RETRIES = 2;
export const isStatementTimeout = (error) => error?.code === "57014" || /statement timeout/i.test(String(error?.message || ""));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readPage(buildQuery, from, pageSize, retryDelayMs) {
  for (let attempt = 0; ; attempt++) {
    const result = await buildQuery().order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (!result.error || !isStatementTimeout(result.error) || attempt >= RETRIES) return result;
    await pause(retryDelayMs * (attempt + 1));
  }
}

export async function readAll(buildQuery, { pageSize = READ_PAGE_SIZE, maxRows = MAX_ROWS, retryDelayMs = 400 } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await readPage(buildQuery, from, pageSize, retryDelayMs);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
  return { data: null, error: new Error(`Lecture interrompue : plus de ${maxRows} lignes.`) };
}

// Lecture par paquets d'identifiants (filtre « in ») : chaque paquet est lu en
// entier, au plus `concurrency` paquets à la fois (une rafale de requêtes
// parallèles faisait dépasser le délai d'exécution de la base).
export async function readChunks(chunks, buildQuery, { concurrency = 3, ...options } = {}) {
  const rows = [];
  const queue = [...chunks];
  let failure = null;
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length && !failure) {
      const ids = queue.shift();
      const { data, error } = await readAll(() => buildQuery(ids), options);
      if (error) { failure = error; return; }
      rows.push(...data);
    }
  }));
  return failure ? { data: null, error: failure } : { data: rows, error: null };
}
