import { nationalityBadges } from "./nationalities";

// Identité d'un joueur : nationalité(s) civile(s), date de naissance et lien avec
// la Belgique. Règle centrale : la NATIONALITÉ et la SÉLECTION représentée sont
// deux informations distinctes (players.national_team_id + national_team_locked).
//
// Marqueurs éditoriaux (players.ext, jamais écrit par les synchronisations) :
//   ext.editorial_nationality  nationalité(s) fixée(s) depuis l'administration
//   ext.editorial_birth_date   date de naissance fixée depuis l'administration
//   ext.binational_watch       classé « Belge binational à suivre »
//   ext.editorial_fields       champs corrigés à la main (["name", "photo_url"])

export function nationalityList(value) {
  return String(value || "").split(/[,;/|]/).map((part) => part.trim()).filter(Boolean);
}

// « Belgium », « Belgique, Maroc », « Morocco, Belgium », « Belgo-marocain »…
export function hasBelgianNationality(value) {
  if (!String(value || "").trim()) return false;
  return nationalityBadges(value).some((badge) => badge.code === "BE");
}

// Une nationalité est éditoriale si l'admin l'a fixée, ou si elle contient plus
// d'informations que l'API (qui ne fournit qu'une nationalité) : plusieurs
// valeurs ou une forme « belgo-… ». Heuristique historique conservée.
export function isEditorialNationality(player) {
  if (!player) return false;
  return player.ext?.editorial_nationality === true
    || nationalityList(player.nationality).length > 1
    || /\bbelgo\b/i.test(player.nationality || "");
}

export function isEditorialBirthDate(player) {
  return player?.ext?.editorial_birth_date === true;
}

// Nom et photo corrigés à la main : jamais remplacés par une synchronisation.
export const EDITORIAL_IDENTITY_FIELDS = ["name", "photo_url"];

export function isEditorialField(player, field) {
  return Array.isArray(player?.ext?.editorial_fields) && player.ext.editorial_fields.includes(field);
}

// Marqueurs après une édition manuelle : un champ modifié et non vide devient
// éditorial ; un champ vidé redevient géré par les synchronisations.
export function editorialFieldsAfterEdit(ext, before = {}, after = {}, fields = EDITORIAL_IDENTITY_FIELDS) {
  const current = new Set(Array.isArray(ext?.editorial_fields) ? ext.editorial_fields : []);
  for (const field of fields) {
    const value = after?.[field];
    const cleared = value === null || value === undefined || String(value).trim() === "";
    if (cleared) current.delete(field);
    else if (String(value) !== String(before?.[field] ?? "")) current.add(field);
  }
  const next = { ...(ext || {}) };
  if (current.size) next.editorial_fields = [...current].sort();
  else delete next.editorial_fields;
  return next;
}

const present = (value) => value !== null && value !== undefined && String(value).trim() !== "";

// Champs d'identité à écrire lors d'une synchronisation provider.
// - Nouveau joueur : valeurs du provider (éventuellement nulles).
// - Joueur existant : une valeur éditoriale n'est jamais remplacée, et une valeur
//   provider absente n'efface jamais la valeur connue. Sinon, mise à jour normale.
// Les champs omis du patch sont conservés tels quels en base.
// Nom et photo : mêmes règles (une valeur corrigée à la main n'est jamais
// remplacée ; une valeur absente de l'API n'efface jamais la valeur connue).
export function providerIdentityPatch(existing, incoming = {}) {
  if (!existing) {
    const created = { nationality: present(incoming.nationality) ? incoming.nationality : null, birth_date: present(incoming.birth_date) ? incoming.birth_date : null };
    for (const field of EDITORIAL_IDENTITY_FIELDS) if (field in incoming) created[field] = present(incoming[field]) ? incoming[field] : null;
    return created;
  }
  const patch = {};
  if (!isEditorialNationality(existing) && present(incoming.nationality)) patch.nationality = incoming.nationality;
  if (!isEditorialBirthDate(existing) && present(incoming.birth_date)) patch.birth_date = incoming.birth_date;
  for (const field of EDITORIAL_IDENTITY_FIELDS) if (!isEditorialField(existing, field) && present(incoming[field])) patch[field] = incoming[field];
  return patch;
}

// Nombre de nationalités distinctes reconnues (« Belgo-marocain » en compte deux).
function nationalityCount(value) {
  const codes = new Set(nationalityBadges(value).map((badge) => badge.code).filter(Boolean));
  return Math.max(codes.size, nationalityList(value).length);
}

function representsBelgium(nationalTeam) {
  if (!nationalTeam) return false;
  return hasBelgianNationality(nationalTeam.name) || hasBelgianNationality(nationalTeam.ext?.country);
}

// Statut de suivi lié à la Belgique :
//   "belgium"    représente la Belgique (sélection représentée belge)
//   "binational" Belge binational à suivre (classement manuel, autre sélection
//                représentée, ou plusieurs nationalités connues)
//   "belgian"    nationalité belge, sans autre information
//   null         aucun lien belge connu
export function belgianWatchStatus(player, nationalTeam = null) {
  if (!player) return null;
  const belgian = hasBelgianNationality(player.nationality);
  const manualWatch = player.binational_watch === true || player.ext?.binational_watch === true;
  if (!belgian && !manualWatch) return null;
  if (representsBelgium(nationalTeam)) return manualWatch ? "binational" : "belgium";
  if (manualWatch || nationalTeam || nationalityCount(player.nationality) > 1) return "binational";
  return "belgian";
}

// Inclusion dans le suivi des Belges (annuaire, accueil, carte).
export function isBelgianFollowed(player) {
  return belgianWatchStatus(player) !== null;
}
