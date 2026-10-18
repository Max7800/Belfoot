// Sélections nationales ≠ clubs.
//
// L'API signale une sélection par `team.national = true`. Sans ce classement, une
// sélection importée par une compétition de sélections (Nations League,
// qualifications…) restait `team_type = first_team` : ses joueurs recevaient une
// affectation de CLUB (player_team_seasons) et parfois la sélection comme « club
// actuel ». Les convocations ont leur propre table (national_team_callups).
import { loadByExternalIds } from "./sync";

const AGE_CATEGORIES = new Set(["u15", "u16", "u17", "u18", "u19", "u20", "u21", "u23"]);

// Catégorie et genre d'après le nom renvoyé par l'API (« Morocco U20 W »,
// « Belgium W », « Germany U21 »). Une catégorie inconnue n'est pas inventée.
export function nationalTeamTraits(name) {
  const text = String(name || "").trim();
  const women = /(^|\s)W$/.test(text) || /\bwomen\b/i.test(text);
  const age = text.match(/\bU-?\s?(\d{2})\b/i)?.[1];
  const ageCategory = age && AGE_CATEGORIES.has(`u${age}`) ? `u${age}` : null;
  const category = age ? ageCategory : (women ? "women" : "senior");
  return { category, gender: women ? "women" : "men" };
}

// Patch de classement pour un club existant que l'API désigne comme sélection.
// - jamais pour une ligne verrouillée (choix éditorial) ;
// - team_type devient « national » s'il ne l'est pas déjà ;
// - catégorie et genre seulement s'ils sont vides (jamais écrasés).
export function nationalTeamPatch(existing, providerTeam) {
  if (!existing || existing.locked || providerTeam?.national !== true) return {};
  const traits = nationalTeamTraits(providerTeam.name || existing.name);
  const patch = {};
  if (existing.team_type !== "national") patch.team_type = "national";
  if (!existing.national_category && traits.category) patch.national_category = traits.category;
  if (!existing.national_gender) patch.national_gender = traits.gender;
  return patch;
}

// Applique le classement aux clubs déjà en base pour les équipes fournies par
// l'API (après leur upsert). Renvoie le nombre de clubs reclassés.
export async function classifyNationalTeams(db, source, providerTeams = []) {
  const nationals = (providerTeams || []).filter((team) => team?.national === true && team.external_id);
  if (!nationals.length) return 0;
  const existing = await loadByExternalIds(db, "clubs", source, nationals.map((team) => team.external_id), "id,external_id,name,team_type,national_category,national_gender,locked");
  let updated = 0;
  for (const team of nationals) {
    const row = existing.get(String(team.external_id));
    const patch = nationalTeamPatch(row, team);
    if (!Object.keys(patch).length) continue;
    const { error } = await db.from("clubs").update(patch).eq("id", row.id).eq("locked", false);
    if (error) throw new Error(`clubs/${team.external_id}: ${error.message}`);
    updated++;
  }
  return updated;
}

// Compétition de sélections : portée « international » ou compétition créée par
// l'import des sélections. Tous ses participants sont des équipes nationales.
export function isNationalTeamsCompetition(competition) {
  return competition?.competition_scope === "international" || competition?.ext?.imported_for === "national-teams";
}

// Équipe nationale : type, catégorie, indicateur API conservé dans ext, ou
// participation à une compétition de sélections.
export function isNationalTeam(club, competition = null) {
  if (!club) return false;
  return club.team_type === "national"
    || Boolean(club.national_category)
    || club.ext?.national === true
    || club.ext?.team?.national === true
    || isNationalTeamsCompetition(competition);
}
