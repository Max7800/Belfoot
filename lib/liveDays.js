// Page Direct : navigation par jour (J-5 à J+7), demandée le 28/10/2026 pour
// revoir les matchs des jours précédents. Avant : seulement « aujourd'hui » et
// « à venir », page vide après minuit.
import { isMatchLive } from "./matchStatus";

export const DAYS_BACK = 5;
export const DAYS_AHEAD = 7;

const pad = (value) => String(value).padStart(2, "0");
// Jour local d'une date (« 2026-10-28 »), comme le voit le visiteur.
export function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Bornes de la fenêtre chargée : début de J-5, début de J+8 (exclu).
export function dayWindow(now = new Date(), back = DAYS_BACK, ahead = DAYS_AHEAD) {
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - back);
  const end = new Date(now); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + ahead + 1);
  return { start, end };
}

// Jours de la barre, du plus ancien au plus lointain, avec un libellé lisible.
export function dayStrip(now = new Date(), back = DAYS_BACK, ahead = DAYS_AHEAD) {
  const today = new Date(now); today.setHours(12, 0, 0, 0);
  const relative = { [-1]: "Hier", 0: "Aujourd'hui", 1: "Demain" };
  return Array.from({ length: back + ahead + 1 }, (_, index) => {
    const offset = index - back;
    const date = new Date(today); date.setDate(today.getDate() + offset);
    return {
      key: localDayKey(date),
      offset,
      label: relative[offset] || date.toLocaleDateString("fr-BE", { weekday: "short", day: "numeric" }),
      long: date.toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long" }),
    };
  });
}

export function matchesByDay(matches = []) {
  const days = {};
  for (const match of matches) {
    const key = localDayKey(match.kickoff);
    if (key) (days[key] ||= []).push(match);
  }
  return days;
}

// Vue ouverte au chargement : le direct s'il y en a ; sinon aujourd'hui s'il y a
// des matchs ; sinon les derniers résultats (jour passé le plus récent) ; sinon le
// prochain jour de match ; à défaut aujourd'hui.
export function defaultDay(matches = [], now = new Date()) {
  if (matches.some(isMatchLive)) return "live";
  const today = localDayKey(now);
  const keys = Object.keys(matchesByDay(matches)).sort();
  if (keys.includes(today)) return today;
  const past = keys.filter((key) => key < today);
  if (past.length) return past[past.length - 1];
  return keys.find((key) => key > today) || today;
}
