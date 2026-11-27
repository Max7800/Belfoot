// Échéances confirmées, en UTC. Ce registre est informatif : il ne déclenche
// aucun import et ne signifie pas qu'une source automatique a été configurée.
export const INTERNATIONAL_DRAW_EVENTS = [
  { id: "euro-2028-qualifying", title: "Qualifications Euro 2028", at: "2026-12-06T17:00:00Z", source: "https://www.uefa.com/euro2028/news/02ab-220f53285777-d06eb4905ec1-1000--uefa-euro-2028-qualifying-draw/" },
  { id: "u19-2027-round3", title: "Euro U19 2027 · qualifications tour 3", at: "2026-12-10T10:30:00Z", source: "https://www.uefa.com/under19/news/02ab-22181b41a961-5dfbab472e17-1000--uefa-under-19-championship-round-3-draw/" },
  { id: "u17-2027-round2", title: "Euro U17 2027 · qualifications tour 2", at: "2026-12-10T11:15:00Z", source: "https://www.uefa.com/under17/news/02ab-2219692229fc-aa9d0c422656-1000--uefa-european-under-17-championship-qualifying-round-2-draw/" },
];

export function upcomingInternationalDraws(now = Date.now()) {
  const archiveDelay = 30 * 86400000;
  return INTERNATIONAL_DRAW_EVENTS.filter((event) => now < Date.parse(event.at) + archiveDelay)
    .map((event) => ({ ...event, status: now < Date.parse(event.at) ? "upcoming" : "check", automatic: false }));
}
