// Renouvellement automatique des campagnes (mode « automatique jusqu'à prête »).
//
// Pour une compétition VISIBLE, déjà suivie en entier (au moins une saison
// importée complètement) et autorisée dans le plan d'import : quand l'API
// annonce une nouvelle saison « en cours » qui n'est pas encore importée en
// entier, la saison est ajoutée au plan pour CETTE compétition seulement
// (« Archive résultats »), importée, contrôlée, puis marquée PRÊTE si tous les
// contrôles passent. L'activation comme saison par défaut reste un clic de
// l'administrateur (dernier contrôle humain).
//
// Compétitions SURVEILLÉES (case « Surveiller » du plan d'import, config.watch) :
// même mécanisme pour une compétition encore masquée et jamais importée (ex.
// qualifications de l'Euro 2028) ; la campagne est importée, contrôlée et
// marquée prête en restant MASQUÉE — la publication reste un geste de
// l'administrateur.
//
// Une campagne n'est « à jour » que si elle est importée en entier ET contient
// au moins un match : l'API annonce souvent une saison avant d'en publier le
// calendrier ; un import vide est retenté (tous les WAITING_RETRY_HOURS) au lieu
// d'être considéré comme fait pour toujours.
//
// Ce module ne fait que décider (fonctions pures) ; le job
// football.campaign-rollover exécute.
import { isImportSeasonLabel } from "./importPlan";
import { seasonLabel } from "@/modules/football/season";

// Nouvelle campagne à préparer, ou la raison pour laquelle il n'y en a pas.
export const WAITING_RETRY_HOURS = 72;

// `importedMatches` : matchs déjà en base pour la campagne (null = inconnu).
export function detectNewCampaign({ competition, league, importedMatches = null } = {}) {
  const current = (league?.seasons || []).find((season) => season?.current === true);
  if (!current) return { skip: "aucune saison « en cours » annoncée par l'API" };
  const year = Number(current.year);
  if (!Number.isInteger(year)) return { skip: "saison API illisible" };
  const label = seasonLabel(String(year));
  if (!isImportSeasonLabel(label)) return { skip: `libellé ${label} invalide` };
  if (competition?.ext?.full_competition_seasons?.[label]) {
    if (importedMatches !== 0) return { skip: `campagne ${label} déjà importée`, label, upToDate: true };
    return { label, year: String(year), refill: true }; // importée vide : calendrier attendu
  }
  return { label, year: String(year) };
}

// Compétition éligible : autorisée, pas désactivée, et soit visible et suivie
// en entier, soit SURVEILLÉE (même masquée, même jamais importée).
export function rolloverEligibility(competition, rawPlan) {
  if (!competition) return "compétition introuvable";
  const config = rawPlan?.competitions?.[competition.id];
  const watched = config?.watch === true;
  if (competition.public_visible === false && !watched) return "compétition masquée (cocher « Surveiller » dans le plan d'import pour suivre ses nouvelles campagnes)";
  if (competition.provider !== "apifootball" || !competition.external_id) return "fournisseur non pris en charge";
  if (!watched && !Object.keys(competition.ext?.full_competition_seasons || {}).length) return "compétition jamais importée en entier";
  if (!config?.enabled) return "compétition non autorisée dans le plan d'import";
  if (config.auto_rollover === false) return "renouvellement automatique désactivé pour cette compétition";
  return null;
}

// Plan d'import avec la nouvelle campagne autorisée pour CETTE compétition.
// Une saison présente dans le plan mais désactivée globalement est un choix de
// l'administrateur : elle n'est jamais réactivée automatiquement.
export function planWithCampaign(rawPlan, label, competitionId) {
  if (!Array.isArray(rawPlan?.seasons)) return { skip: "plan d'import à saison unique (ancien format)" };
  if (!isImportSeasonLabel(label)) return { skip: `libellé ${label} invalide` };
  const config = rawPlan.competitions?.[competitionId];
  if (!config?.enabled) return { skip: "compétition non autorisée dans le plan d'import" };
  const existing = rawPlan.seasons.find((season) => season?.label === label);
  if (existing && existing.enabled === false) return { skip: `saison ${label} désactivée dans le plan (choix de l'administrateur)` };
  const seasons = existing ? rawPlan.seasons : [...rawPlan.seasons, { label, role: "added", order: 100 + Number(label.slice(0, 4)), enabled: true }];
  const target = config.seasons?.[label] || {};
  const nextTarget = {
    ...target,
    enabled: true,
    scope: target.enabled === true && target.scope ? target.scope : "base",
    expected_clubs: target.expected_clubs ?? config.expected_clubs ?? 0,
    expected_matches: target.expected_matches ?? config.expected_matches ?? 0,
  };
  const changed = !existing || target.enabled !== true;
  return {
    changed,
    plan: { ...rawPlan, seasons, competitions: { ...rawPlan.competitions, [competitionId]: { ...config, seasons: { ...(config.seasons || {}), [label]: nextTarget } } } },
  };
}

// Compétition dont la dernière vérification date de plus de `intervalHours`
// (WAITING_RETRY_HOURS si le calendrier de la campagne était attendu).
export function rolloverDue(state = {}, now = Date.now(), intervalHours = 24) {
  const last = Date.parse(state?.checkedAt || "") || 0;
  const hours = state?.status === "waiting" ? WAITING_RETRY_HOURS : intervalHours;
  return now - last >= hours * 3600000;
}

// Compétitions surveillées ET autorisées dans le plan (identifiants).
export function watchedCompetitionIds(rawPlan) {
  return Object.entries(rawPlan?.competitions || {}).filter(([, config]) => config?.watch === true && config?.enabled).map(([id]) => id);
}
