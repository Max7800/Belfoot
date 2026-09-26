import { seasonYear } from "@/modules/football/season";

export const IMPORT_GROUPS = [
  { key: "pro-league", label: "1. Pro League", externalIds: ["144"] },
  { key: "challenger", label: "2. Challenger Pro League", externalIds: ["145"] },
  { key: "croky", label: "3. Croky Cup", externalIds: ["147"] },
  { key: "national", label: "4. Sélections belges", externalIds: [] },
  { key: "foreign", label: "5. Compétitions étrangères", externalIds: [] },
];

export const DEFAULT_IMPORT_PLAN = {
  season: "2026-2027",
  competitions: {},
  nationalTeams: {},
};

export function normalizeImportPlan(value = {}) {
  return {
    season: value.season || DEFAULT_IMPORT_PLAN.season,
    competitions: value.competitions && typeof value.competitions === "object" ? value.competitions : {},
    nationalTeams: value.nationalTeams && typeof value.nationalTeams === "object" ? value.nationalTeams : {},
  };
}

export function suggestedGroup(competition) {
  const externalId = String(competition?.external_id || "");
  return IMPORT_GROUPS.find((group) => group.externalIds.includes(externalId))?.key || "foreign";
}

export function orderedImportTargets(plan, competitions = [], nationalTeams = []) {
  const normalized = normalizeImportPlan(plan);
  const targets = [];
  for (const competition of competitions) {
    const config = normalized.competitions[competition.id];
    if (!config?.enabled) continue;
    targets.push({ type: "competition", id: competition.id, label: competition.name, group: config.group || suggestedGroup(competition), order: Number(config.order) || 999 });
  }
  for (const team of nationalTeams) {
    const externalId = String(team.external_id || "");
    const config = normalized.nationalTeams[externalId];
    if (!config?.enabled) continue;
    targets.push({ type: "national-team", id: externalId, label: team.name, group: "national", order: Number(config.order) || 999 });
  }
  const groupOrder = Object.fromEntries(IMPORT_GROUPS.map((group, index) => [group.key, index]));
  return targets.sort((a, b) => (groupOrder[a.group] ?? 99) - (groupOrder[b.group] ?? 99) || a.order - b.order || a.label.localeCompare(b.label));
}

export async function assertImportTargetAllowed(db, key, ctx, catalogEntry = {}) {
  if (catalogEntry.target === "competition" && !ctx.competitionId) {
    throw new Error("Choisis une compétition : les imports globaux sont désactivés pour protéger le quota.");
  }
  if (catalogEntry.target === "national" && !ctx.teamExternalId) {
    throw new Error("Renseigne la sélection ciblée : les imports nationaux globaux sont désactivés.");
  }
  if (seasonYear(ctx.season) < 2026 || key === "football.find-national-teams") return;

  const { data, error } = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
  if (error) throw new Error(`Impossible de lire le plan d'import : ${error.message}`);
  const plan = normalizeImportPlan(data?.data?.football_import_plan);
  if (seasonYear(plan.season) !== seasonYear(ctx.season)) {
    throw new Error(`Le plan autorisé concerne ${plan.season}, pas ${ctx.season}.`);
  }
  if (catalogEntry.target === "competition" && !plan.competitions[String(ctx.competitionId)]?.enabled) {
    throw new Error("Cette compétition n'est pas autorisée dans la whitelist 2026.");
  }
  if (catalogEntry.target === "national" && !plan.nationalTeams[String(ctx.teamExternalId)]?.enabled) {
    throw new Error("Cette sélection n'est pas autorisée dans la whitelist 2026.");
  }
}
