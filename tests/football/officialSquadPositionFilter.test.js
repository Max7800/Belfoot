import { describe, expect, it } from "vitest";
import { filterPositionGroups, groupByPosition } from "@/lib/positions";
import { rbfaSquadGroups } from "@/lib/rbfaPublicSelection";

describe("filtres par poste des listes officielles", () => {
  it("filtre la liste FIFA en conservant les joueurs sans fiche liée", () => {
    const rows = [{ name: "Gardien", position: "Goalkeeper" }, { name: "Attaquant", position: "Forward" }, { name: "Inconnu", position: "" }];
    const groups = groupByPosition(rows, (row) => row.position);
    expect(filterPositionGroups(groups, "ALL").flatMap((group) => group.rows)).toEqual(rows);
    expect(filterPositionGroups(groups, "FWD").flatMap((group) => group.rows.map((row) => row.name))).toEqual(["Attaquant"]);
    expect(filterPositionGroups(groups, "OTHER")[0].rows[0].name).toBe("Inconnu");
  });
  it("regroupe les listes RBFA sur le poste connu et garde les joueurs non liés", () => {
    const snapshot = { players: [{ name: "Défenseur", playerId: "a" }, { name: "Non lié", playerId: null }], playerDetails: { a: { position: "Defender" } } };
    const groups = rbfaSquadGroups(snapshot);
    expect(filterPositionGroups(groups, "DEF")[0].rows[0].name).toBe("Défenseur");
    expect(filterPositionGroups(groups, "OTHER")[0].rows[0].name).toBe("Non lié");
    expect(filterPositionGroups(groups).flatMap((group) => group.rows)).toHaveLength(2);
  });
});
