export const UEFA_U21_DRAW_KEY = "football_uefa_u21_2027_draw";
export const UEFA_U21_DRAW_SOURCE = "https://www.uefa.com/under21/news/02ab-222a4b785df8-f208919f1a51-1000--2027-under-21-euro-final-draw-made/";
export const UEFA_U21_START = Date.parse("2027-06-16T00:00:00Z");
export const UEFA_U21_NAMES = { Serbia: "Serbie", Poland: "Pologne", England: "Angleterre", France: "France", Albania: "Albanie", Spain: "Espagne", Italy: "Italie", Finland: "Finlande", Czechia: "Tchéquie", Portugal: "Portugal", Greece: "Grèce", Croatia: "Croatie", Norway: "Norvège", Belgium: "Belgique", Germany: "Allemagne", Netherlands: "Pays-Bas" };
export function validU21Draw(groups) {
  if (!Array.isArray(groups) || groups.length !== 4) return false;
  const teams = groups.flatMap((group) => group?.teams || []);
  return groups.every((group, i) => group?.label === `Group ${"ABCD"[i]}` && Array.isArray(group.teams) && group.teams.length === 4) && teams.length === 16 && new Set(teams).size === 16 && teams.every((team) => Object.hasOwn(UEFA_U21_NAMES, team));
}
