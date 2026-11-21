// Liste officielle FIFA, version du 21 novembre 2026 à 11:55 UTC, page 4.
// Instantané propre au tournoi : ne pas remplacer par la sélection actuelle.
const BELGIUM = [
  ["Mattis Seghers", "Goalkeeper"], ["Tinus Moorthamer", "Defender"],
  ["Elie Mbavu", "Defender"], ["Preben Blondeel", "Defender"],
  ["Assil Saidi", "Defender"], ["Louie Van Gelder", "Midfielder"],
  ["Rayan Garcia Belkacem", "Attacker"], ["Xander Dierckx", "Midfielder"],
  ["Ilyas Benktib", "Attacker"], ["Jelle Driessen", "Midfielder"],
  ["Kiyan Achahbar", "Attacker"], ["Lowie Piselé", "Goalkeeper"],
  ["Al-Hassan Kamara", "Attacker"], ["Leni Strouwen", "Defender"],
  ["Mamadou Baldé", "Defender"], ["Niels Filippo", "Attacker"],
  ["Anthony Philips", "Attacker"], ["Matteo Soria", "Attacker"],
  ["Djibril Gbemou", "Midfielder"], ["Edgard Opoku", "Defender"],
  ["Esteban Levaux", "Goalkeeper"],
].map(([name, position], index) => ({ id: null, rosterKey: `fifa-2026-bel-${index + 1}`, name, position }));

export const FIFA_U17_SQUAD_URL = "https://fdp.fifa.org/assetspublic/ce303/pdf/SquadLists-English.pdf";
export function fifaU17Roster(competitionId, seasonLabel, teamId) {
  return competitionId === "d7088941-8ca5-4d6f-aa3d-c3724d44ba2b" && seasonLabel === "2026-2027" && teamId === "1880918a-1176-4471-8056-b4b67f3a12e1" ? BELGIUM : null;
}
