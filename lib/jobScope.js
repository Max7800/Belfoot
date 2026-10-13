// Périmètre explicite des jobs : chaque job déclare dans JOB_CATALOG les
// périmètres qu'il accepte, et AUCUN job ciblé ne peut parcourir toute la base
// parce qu'un identifiant manque.
//
//   competition : une compétition (competitionId obligatoire)
//   national    : une sélection (teamExternalId obligatoire)
//   live        : les compétitions activées pour le direct (live_enabled)
//   none        : aucune donnée sportive ciblée (recherche)
//   global      : toutes les compétitions — UNIQUEMENT pour un pipeline déclaré
//                 `globalScope` dans JOB_PIPELINES, jamais sur demande du client.
import { JOB_CATALOG } from "@/lib/jobCatalog";

export const JOB_SCOPE_ERROR = "JOB_SCOPE";

export class JobScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = "JobScopeError";
    this.code = JOB_SCOPE_ERROR;
  }
}

const SCOPE_LABELS = {
  competition: "une compétition",
  national: "une sélection",
  live: "les compétitions du direct",
  none: "aucune cible",
  global: "toutes les compétitions (pipeline global)",
};

const present = (value) => value !== null && value !== undefined && String(value).trim() !== "";

// Périmètre réellement demandé par le contexte, en fonction des périmètres
// acceptés par le job. Lève JobScopeError avant tout appel API et toute écriture.
export function resolveJobScope(key, ctx = {}) {
  const entry = JOB_CATALOG[key];
  if (!entry) throw new JobScopeError(`Job inconnu : ${key}`);
  const scopes = entry.scopes || [];
  if (!scopes.length) throw new JobScopeError(`${key} : aucun périmètre déclaré, exécution refusée.`);
  if (ctx.globalScope === true) {
    if (!scopes.includes("global")) throw new JobScopeError(`${key} : le périmètre global n'est pas autorisé pour ce job.`);
    return "global";
  }
  if (scopes.includes("national") && present(ctx.teamExternalId)) return "national";
  if (scopes.includes("competition") && present(ctx.competitionId)) return "competition";
  if (scopes.includes("live") && !present(ctx.competitionId)) return "live";
  if (scopes.includes("none")) return "none";
  const expected = scopes.filter((scope) => scope !== "global").map((scope) => SCOPE_LABELS[scope] || scope).join(" ou ");
  throw new JobScopeError(`${entry.label || key} : périmètre manquant (attendu : ${expected}). Aucun parcours de toute la base n'est autorisé sans pipeline global explicite.`);
}

// Défense en profondeur dans les jobs eux-mêmes : même appelés sans passer par
// runJob, ils refusent l'absence d'identifiant au lieu de tout parcourir.
export function requireCompetitionId(key, competitionId, { allowGlobal = false, globalScope = false } = {}) {
  if (present(competitionId)) return;
  if (allowGlobal && globalScope === true) return;
  throw new JobScopeError(`${JOB_CATALOG[key]?.label || key} : choisis une compétition. Aucun parcours de toutes les compétitions n'est autorisé ici.`);
}
