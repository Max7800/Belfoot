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

export async function readAll(buildQuery, { pageSize = READ_PAGE_SIZE, maxRows = MAX_ROWS } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildQuery().order("id", { ascending: true }).range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
  return { data: null, error: new Error(`Lecture interrompue : plus de ${maxRows} lignes.`) };
}
