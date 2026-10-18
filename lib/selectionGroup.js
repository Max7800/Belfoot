// Groupe d'une sélection dans une compétition importée en entier, avec la
// MÊME règle que la page compétition (lib/groupedStandings.js) : groupes
// officiels de la saison affichée uniquement, phases éclatées regroupées,
// officiel daté, groupes détectés si l'officiel est contredit par les matchs.
// Retourne null si la compétition n'a pas de groupes exploitables pour la
// sélection : l'appelant garde alors son calcul historique.
import { mergeGroupStagePhases, phaseGroups } from "./groupedStandings";

const byKickoffDesc = (a, b) => Date.parse(b.kickoff || 0) - Date.parse(a.kickoff || 0);

export function selectionGroupStanding({ competition, seasonLabel, matches = [], teamId, isKnockout = () => false } = {}) {
  if (!competition || !seasonLabel || !teamId || !matches.length) return null;
  const merged = mergeGroupStagePhases(competition, seasonLabel, matches, { isKnockout });
  // Phase de groupes de la sélection : celle de son match de groupe le plus récent.
  const own = merged.filter((m) => (m.home_club_id === teamId || m.away_club_id === teamId) && m.phase && !isKnockout(m.phase)).sort(byKickoffDesc);
  if (!own.length) return null;
  const phase = own[0].phase;
  const groups = phaseGroups(competition, seasonLabel, merged.filter((m) => m.phase === phase), {});
  const group = groups.find((g) => g.kind === "group" && (g.teamIds || g.rows.map((r) => r.club)).includes(teamId));
  if (!group) return null;
  return {
    label: group.label,
    source: group.official === false ? "detected" : group.source,
    rows: group.rows.map((row) => ({ ...row, gd: row.gd ?? (Number(row.gf) || 0) - (Number(row.ga) || 0) })),
  };
}
