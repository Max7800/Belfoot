import { readAll } from "@/lib/readAll";
import { compareRbfaSelection } from "@/modules/football/rbfaSelections";

// Aucune création de fiche : une correspondance est proposée seulement si la
// date et le nom concordent et qu'il n'y a aucune ambiguïté des deux côtés.
export async function resolveRbfaPlayerLinks(db, official) {
  const dates = [...new Set(official.map((person) => person.birthDate).filter(Boolean))];
  if (!dates.length) return new Map();
  const result = await readAll(() => db.from("players").select("id,name,birth_date").in("birth_date", dates));
  if (result.error) throw result.error;
  const compared = compareRbfaSelection(official, result.data || [], []);
  return new Map(compared.matched.map((row) => [row.official.sourceId, row.playerId]));
}
