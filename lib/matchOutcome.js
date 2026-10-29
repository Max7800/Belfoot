// Issue d'un match terminé, pour la lire d'un coup d'œil (page Direct, accueil),
// demandé le 29/10/2026 : vainqueur, nul, perdant ; et pastille V / N / D du point
// de vue belge (la Belgique, ou le club d'un Belge suivi).
import { isMatchFinished } from "./matchStatus";

export function matchOutcome(match) {
  if (!isMatchFinished(match) || match?.home_score == null || match?.away_score == null) return { home: null, away: null };
  const home = Number(match.home_score);
  const away = Number(match.away_score);
  if (home === away) return { home: "draw", away: "draw" };
  return home > away ? { home: "win", away: "loss" } : { home: "loss", away: "win" };
}

const LETTER = { win: "V", draw: "N", loss: "D" };
// Pastille du camp suivi (« home » ou « away ») ; aucune si le match n'est pas terminé.
export function sideResult(match, side) {
  const outcome = matchOutcome(match)[side];
  return outcome ? { outcome, letter: LETTER[outcome] } : null;
}
