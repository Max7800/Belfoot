// Une donnée absente n'est pas un zéro ; seules deux mesures connues peuvent
// former une comparaison. Les fautes et cartons ne désignent pas un vainqueur.
const DISCIPLINARY_FIELDS = new Set(["fouls", "offsides", "yellow", "red"]);

export const matchEventSide = (event, homeId, awayId) => event?.club_id && event.club_id === homeId ? "home" : event?.club_id && event.club_id === awayId ? "away" : null;

export function matchComparison(field, home, away) {
  const value = (input) => input == null || input === "" || !Number.isFinite(Number(input)) ? null : Number(input);
  const left = value(home);
  const right = value(away);
  const comparable = left != null && right != null;
  const total = comparable ? Math.max(0, left) + Math.max(0, right) : 0;
  const percentage = field === "possession" || field === "pass_accuracy";
  return {
    home: left, away: right, comparable,
    homeWidth: comparable ? percentage ? Math.max(0, Math.min(100, left)) : total ? Math.max(0, left) / total * 100 : 0 : 0,
    awayWidth: comparable ? percentage ? Math.max(0, Math.min(100, right)) : total ? Math.max(0, right) / total * 100 : 0 : 0,
    leader: !comparable || DISCIPLINARY_FIELDS.has(field) || left === right ? null : left > right ? "home" : "away",
  };
}
