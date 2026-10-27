// Entraîneur actuel d'un club d'après la réponse /coachs?team= d'API-Football.
//
// Constat du 27/10/2026 : « N. Hayen » restait l'entraîneur de Club Brugge.
// L'ancien choix prenait le PREMIER coach sans date de fin dans ce club, puis à
// défaut le premier de la liste — un entraîneur parti l'emportait dès que
// l'API tardait à clôturer son mandat ou ne listait plus son successeur.
//
// Règle : parmi les coachs dont le mandat dans CE club est ouvert (pas de date
// de fin), celui arrivé le plus récemment. Si l'API connaît des coachs du club
// mais aucun mandat ouvert : poste vacant (on n'affiche pas un ancien). Si
// l'API ne renvoie rien : inconnu (on ne touche à rien).
const startOf = (career) => Date.parse(career?.start || "") || 0;

export function pickCurrentCoach(rows = [], teamExternalId) {
  const team = String(teamExternalId ?? "");
  const stints = rows.flatMap((coach) => (coach?.career || [])
    .filter((career) => String(career?.team?.id ?? "") === team)
    .map((career) => ({ coach, career })));
  if (!stints.length) return { status: "unknown" };
  const open = stints.filter(({ career }) => !career.end).sort((a, b) => startOf(b.career) - startOf(a.career));
  if (!open.length || !open[0].coach?.id) return { status: "vacant" };
  return { status: "current", coach: open[0].coach };
}
