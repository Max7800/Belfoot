import { matchStatusMeta } from "./matchStatus";

// Un aperçu ne doit pas annoncer comme prochain un match passé ou reporté.
export function nextClubFixture(matches = [], now = Date.now()) {
  return matches.filter((match) => {
    const kickoff = Date.parse(match.kickoff || "");
    return Number.isFinite(kickoff) && kickoff >= now && matchStatusMeta(match).key === "scheduled";
  }).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))[0] || null;
}
