import { seasonLabel } from "@/modules/football/season";

export const IMPORT_GROUPS = [
  { key: "pro-league", label: "1. Pro League", externalIds: ["144"] },
  { key: "challenger", label: "2. Challenger Pro League", externalIds: ["145"] },
  { key: "croky", label: "3. Croky Cup", externalIds: ["147"] },
  { key: "national", label: "4. Sélections belges", externalIds: [] },
  { key: "foreign", label: "5. Compétitions étrangères", externalIds: [] },
];

export const IMPORT_SEASONS = [
  { label: "2024-2025", role: "archive", order: 10 },
  { label: "2025-2026", role: "archive", order: 20 },
  { label: "2026-2027", role: "rollout", order: 30 },
];

export const IMPORT_SCOPES = {
  base: { label: "Calendrier", description: "Matchs, clubs et informations de compétition." },
  squads: { label: "+ Effectifs", description: "Calendrier, joueurs et entraîneurs." },
  complete: { label: "Complet", description: "Ajoute événements, compositions et performances des matchs." },
};

export const DEFAULT_IMPORT_PLAN = {
  version: 2,
  apiBudget: 7500,
  careerReserve: 500,
  liveReserve: 500,
  seasons: IMPORT_SEASONS.map((season) => ({ ...season, enabled: true })),
  competitions: {},
  nationalTeams: {},
};

export function suggestedGroup(competition) {
  const externalId = String(competition?.external_id || "");
  return IMPORT_GROUPS.find((group) => group.externalIds.includes(externalId))?.key || "foreign";
}

export function defaultCompetitionEstimate(competition) {
  const externalId = String(competition?.external_id || "");
  if (externalId === "144") return { expected_clubs: 18, expected_matches: 306 };
  if (externalId === "145") return { expected_clubs: 16, expected_matches: 240 };
  if (externalId === "147") return { expected_clubs: 64, expected_matches: 63 };
  return { expected_clubs: 20, expected_matches: 380 };
}

function normalizedSeasons(value) {
  const stored = Array.isArray(value?.seasons) ? value.seasons : [];
  return IMPORT_SEASONS.map((fallback) => {
    const configured = stored.find((season) => seasonLabel(season.label) === fallback.label);
    return { ...fallback, ...(configured || {}), label: fallback.label, enabled: stored.length ? configured?.enabled !== false : true };
  });
}

export function normalizeImportPlan(value = {}) {
  const multiSeason = Array.isArray(value.seasons);
  return {
    version: multiSeason ? 2 : Number(value.version) || 1,
    apiBudget: Math.max(1, Number(value.apiBudget) || DEFAULT_IMPORT_PLAN.apiBudget),
    careerReserve: Math.max(0, Number(value.careerReserve) || 0),
    liveReserve: Math.max(0, Number(value.liveReserve) || 0),
    seasons: normalizedSeasons(value),
    competitions: value.competitions && typeof value.competitions === "object" ? value.competitions : {},
    nationalTeams: value.nationalTeams && typeof value.nationalTeams === "object" ? value.nationalTeams : {},
    legacySeason: value.season || "2026-2027",
  };
}

export function hydrateCompetitionConfig(competition, stored = {}, index = 0) {
  const group = stored.group || suggestedGroup(competition);
  const enabledByDefault = group !== "foreign";
  const estimate = defaultCompetitionEstimate(competition);
  const storedSeasons = stored.seasons && typeof stored.seasons === "object" ? stored.seasons : {};
  return {
    enabled: stored.enabled ?? enabledByDefault,
    group,
    order: Number(stored.order) || (index + 1) * 10,
    expected_clubs: Math.max(0, Number(stored.expected_clubs) || estimate.expected_clubs),
    expected_matches: Math.max(0, Number(stored.expected_matches) || estimate.expected_matches),
    seasons: Object.fromEntries(IMPORT_SEASONS.map((season) => [season.label, {
      enabled: storedSeasons[season.label]?.enabled ?? (stored.enabled ?? enabledByDefault),
      scope: IMPORT_SCOPES[storedSeasons[season.label]?.scope] ? storedSeasons[season.label].scope : "complete",
    }])),
  };
}

export function hydrateNationalConfig(stored = {}, index = 0) {
  const storedSeasons = stored.seasons && typeof stored.seasons === "object" ? stored.seasons : {};
  return {
    enabled: stored.enabled ?? true,
    order: Number(stored.order) || (index + 1) * 10,
    expected_matches: Math.max(0, Number(stored.expected_matches) || 12),
    seasons: Object.fromEntries(IMPORT_SEASONS.map((season) => [season.label, {
      enabled: storedSeasons[season.label]?.enabled ?? (stored.enabled ?? true),
      scope: IMPORT_SCOPES[storedSeasons[season.label]?.scope] ? storedSeasons[season.label].scope : "complete",
    }])),
  };
}

export function estimateCompetitionSeason(config, season) {
  const target = config?.seasons?.[season];
  if (!config?.enabled || !target?.enabled) return 0;
  const clubs = Math.max(0, Number(config.expected_clubs) || 0);
  const matches = Math.max(0, Number(config.expected_matches) || 0);
  if (target.scope === "base") return 3;
  if (target.scope === "squads") return 3 + clubs * 4;
  return 3 + clubs * 4 + matches * 3;
}

export function estimateNationalSeason(config, season) {
  const target = config?.seasons?.[season];
  if (!config?.enabled || !target?.enabled) return 0;
  if (target.scope === "base") return 3;
  return 3 + Math.max(0, Number(config.expected_matches) || 0) * 2;
}

export function importPlanEstimate(plan) {
  const normalized = normalizeImportPlan(plan);
  const bySeason = Object.fromEntries(normalized.seasons.map((season) => [season.label, 0]));
  for (const config of Object.values(normalized.competitions)) {
    for (const season of normalized.seasons) bySeason[season.label] += estimateCompetitionSeason(config, season.label);
  }
  for (const config of Object.values(normalized.nationalTeams)) {
    for (const season of normalized.seasons) bySeason[season.label] += estimateNationalSeason(config, season.label);
  }
  const imports = Object.values(bySeason).reduce((sum, value) => sum + value, 0);
  const reserved = normalized.careerReserve + normalized.liveReserve;
  const usableDaily = Math.max(0, normalized.apiBudget - reserved);
  const estimatedDays = imports === 0 ? 0 : usableDaily > 0 ? Math.ceil(imports / usableDaily) : null;
  return { bySeason, imports, reserved, usableDaily, estimatedDays };
}

export function orderedImportTargets(plan, competitions = [], nationalTeams = [], selectedSeason = null) {
  const normalized = normalizeImportPlan(plan);
  const seasons = selectedSeason ? normalized.seasons.filter((season) => season.label === seasonLabel(selectedSeason)) : normalized.seasons;
  const targets = [];
  for (const season of seasons.filter((item) => item.enabled)) {
    for (const competition of competitions) {
      const config = normalized.competitions[competition.id];
      if (!config?.enabled || !config.seasons?.[season.label]?.enabled) continue;
      targets.push({ type: "competition", id: competition.id, label: competition.name, season: season.label, scope: config.seasons[season.label].scope, group: config.group || suggestedGroup(competition), order: Number(config.order) || 999 });
    }
    for (const team of nationalTeams) {
      const externalId = String(team.external_id || "");
      const config = normalized.nationalTeams[externalId];
      if (!config?.enabled || !config.seasons?.[season.label]?.enabled) continue;
      targets.push({ type: "national-team", id: externalId, label: team.name, season: season.label, scope: config.seasons[season.label].scope, group: "national", order: Number(config.order) || 999 });
    }
  }
  const groupOrder = Object.fromEntries(IMPORT_GROUPS.map((group, index) => [group.key, index]));
  const seasonOrder = Object.fromEntries(normalized.seasons.map((season, index) => [season.label, index]));
  return targets.sort((a, b) => (seasonOrder[a.season] ?? 99) - (seasonOrder[b.season] ?? 99) || (groupOrder[a.group] ?? 99) - (groupOrder[b.group] ?? 99) || a.order - b.order || a.label.localeCompare(b.label));
}

export function importPlanSchedule(plan, competitions = [], nationalTeams = []) {
  const normalized = normalizeImportPlan(plan);
  const capacity = Math.max(0, normalized.apiBudget - normalized.careerReserve - normalized.liveReserve);
  const targets = orderedImportTargets(normalized, competitions, nationalTeams).map((target) => {
    const config = target.type === "competition" ? normalized.competitions[target.id] : normalized.nationalTeams[target.id];
    const cost = target.type === "competition"
      ? estimateCompetitionSeason(config, target.season)
      : estimateNationalSeason(config, target.season);
    return { ...target, cost };
  });
  const days = [];
  for (const target of targets) {
    let day = days.at(-1);
    if (!day || (day.cost > 0 && day.cost + target.cost > capacity)) {
      day = { day: days.length + 1, cost: 0, targets: [] };
      days.push(day);
    }
    day.targets.push(target);
    day.cost += target.cost;
  }
  return { capacity, days, oversized: targets.filter((target) => target.cost > capacity) };
}

export async function assertImportTargetAllowed(db, key, ctx, catalogEntry = {}) {
  if (catalogEntry.target === "competition" && !ctx.competitionId) throw new Error("Choisis une compétition : les imports globaux sont désactivés pour protéger le quota.");
  if (catalogEntry.target === "national" && !ctx.teamExternalId) throw new Error("Renseigne la sélection ciblée : les imports nationaux globaux sont désactivés.");
  if (key === "football.find-national-teams") return;

  const { data, error } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
  if (error) throw new Error(`Impossible de lire le plan d'import : ${error.message}`);
  const plan = normalizeImportPlan(data?.data?.football_import_plan);
  const requestedSeason = seasonLabel(ctx.season);

  // Compatibilité avec le plan 2026 à saison unique jusqu'au premier
  // enregistrement volontaire de la nouvelle version multi-saisons.
  if (plan.version < 2) {
    if (Number(requestedSeason.slice(0, 4)) < 2026) return;
    if (seasonLabel(plan.legacySeason) !== requestedSeason) throw new Error(`Le plan autorisé concerne ${plan.legacySeason}, pas ${requestedSeason}.`);
    if (catalogEntry.target === "competition" && !plan.competitions[String(ctx.competitionId)]?.enabled) throw new Error("Cette compétition n'est pas autorisée dans la whitelist 2026.");
    if (catalogEntry.target === "national" && !plan.nationalTeams[String(ctx.teamExternalId)]?.enabled) throw new Error("Cette sélection n'est pas autorisée dans la whitelist 2026.");
    return;
  }

  const seasonConfig = plan.seasons.find((season) => season.label === requestedSeason);
  if (!seasonConfig?.enabled) throw new Error(`La saison ${requestedSeason} n'est pas autorisée dans le plan d'import.`);
  const scopeLevel = { base: 0, squads: 1, complete: 2 };
  const requiredLevel = ["football.events", "football.lineups"].includes(key) ? 2
    : ["football.squads", "football.coaches", "football.team-test", "football.discover-belgians", "football.track-belgians", "football.player-careers", "football.resolve-national-clubs"].includes(key) ? 1
      : 0;
  if (catalogEntry.target === "competition") {
    const config = plan.competitions[String(ctx.competitionId)];
    if (!config?.enabled || !config.seasons?.[requestedSeason]?.enabled) throw new Error(`Cette compétition n'est pas autorisée pour ${requestedSeason}.`);
    const configuredScope = config.seasons[requestedSeason].scope || "base";
    if ((scopeLevel[configuredScope] ?? 0) < requiredLevel) throw new Error(`Le niveau « ${IMPORT_SCOPES[configuredScope]?.label || configuredScope} » n'autorise pas ce job pour ${requestedSeason}.`);
  }
  if (catalogEntry.target === "national") {
    const config = plan.nationalTeams[String(ctx.teamExternalId)];
    if (!config?.enabled || !config.seasons?.[requestedSeason]?.enabled) throw new Error(`Cette sélection n'est pas autorisée pour ${requestedSeason}.`);
    const configuredScope = config.seasons[requestedSeason].scope || "base";
    if ((scopeLevel[configuredScope] ?? 0) < requiredLevel) throw new Error(`Le niveau « ${IMPORT_SCOPES[configuredScope]?.label || configuredScope} » n'autorise pas ce job pour ${requestedSeason}.`);
  }
}
