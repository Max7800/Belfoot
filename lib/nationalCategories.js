// Catégories des sélections belges : règle unique pour la page Diables
// Rouges et l'annuaire des sélections.
//
// - L'ÂGE et le GENRE sont deux informations distinctes. Le genre vient de
//   `national_gender`, sinon du nom API (« Belgium U23 W », « Belgium W ») ;
//   la catégorie historique `women` reste lue comme « équipe A féminine ».
// - Une catégorie inconnue n'est jamais rangée en « A » : elle est ignorée.
// - Les sélections féminines de jeunes sont MASQUÉES (décision du 18/10) sans
//   être supprimées : leurs lignes, matchs et imports restent intacts.

export const CATEGORY_LABELS = { senior: "Diables Rouges", u23: "U23", u21: "Espoirs U21", u20: "U20", u19: "U19", u18: "U18", u17: "U17", u16: "U16", u15: "U15" };
export const WOMEN_SENIOR_LABEL = "Red Flames";
export const CATEGORY_ORDER = ["senior", "u21", "u19", "u17", "u23", "u20", "u18", "u16", "u15"];

const lower = (value) => String(value || "").trim().toLocaleLowerCase("fr");

// Genre : champ stocké d'abord, puis nom API (suffixe « W », « Women »,
// « Red Flames »), puis catégorie historique `women`.
export function teamGender(team) {
  if (team?.national_gender === "women" || team?.national_gender === "men") return team.national_gender;
  const name = String(team?.name || "").trim();
  if (/(^|\s)W$/i.test(name) || /\bwomen\b/i.test(name) || /red flames/i.test(name)) return "women";
  return team?.national_category === "women" ? "women" : "men";
}

// Catégorie d'âge (« senior » = équipe A) ; null si elle n'est pas connue.
export function teamCategory(team) {
  const stored = team?.national_category;
  if (stored === "women") return "senior";
  if (CATEGORY_LABELS[stored]) return stored;
  const age = String(team?.name || "").match(/\bU-?\s?(\d{2})\b/i)?.[1];
  if (age) return CATEGORY_LABELS[`u${age}`] ? `u${age}` : null;
  return stored ? null : "senior";
}

export function categoryLabel(team) {
  const category = teamCategory(team);
  if (category === "senior" && teamGender(team) === "women") return WOMEN_SENIOR_LABEL;
  return CATEGORY_LABELS[category] || category || "Sélection";
}

// Équipe A masculine : seule page où le classement FIFA de la Belgique a un sens.
export function isSeniorMenTeam(team) {
  return Boolean(team) && teamCategory(team) === "senior" && teamGender(team) === "men";
}

// Affichée publiquement : catégorie connue, et pas une féminine de jeunes.
export function isDisplayedNationalTeam(team) {
  const category = teamCategory(team);
  if (!category) return false;
  return teamGender(team) === "men" || category === "senior";
}

export function isBelgianNationalTeam(team) {
  const name = lower(team?.name);
  const country = lower(team?.ext?.country || team?.ext?.team?.country);
  // Certains imports nomment les équipes « Belgium U21 », d'autres
  // renseignent uniquement le pays dans ext. Les deux doivent rester visibles.
  return /^(belgium|belgique)(\s|$)/i.test(name) || country === "belgium" || country === "belgique" || name.includes("diables") || name.includes("red flames");
}

const orderOf = (team) => {
  const index = CATEGORY_ORDER.indexOf(teamCategory(team));
  return index < 0 ? 99 : index;
};

// Une équipe par onglet (genre + catégorie) : la plus active, puis la suivie.
// `activity` : Map id → nombre de matchs et de convocations.
export function pickNationalTabs(candidates = [], activity = new Map()) {
  const canonical = new Map();
  for (const team of candidates) {
    if (!isDisplayedNationalTeam(team)) continue;
    const enriched = { ...team, national_category: teamCategory(team), national_gender: teamGender(team), _activity: activity.get(team.id) || 0 };
    const key = `${enriched.national_gender}:${enriched.national_category}`;
    const current = canonical.get(key);
    if (!current || enriched._activity > current._activity || (enriched._activity === current._activity && enriched.national_followed && !current.national_followed)) canonical.set(key, enriched);
  }
  return [...canonical.values()].sort((a, b) => (a.national_gender === b.national_gender ? 0 : a.national_gender === "men" ? -1 : 1) || orderOf(a) - orderOf(b) || b._activity - a._activity);
}

export function sortNationalTeams(teams = []) {
  return [...teams].filter(isDisplayedNationalTeam).sort((a, b) => (teamGender(a) === teamGender(b) ? 0 : teamGender(a) === "men" ? -1 : 1) || orderOf(a) - orderOf(b));
}
