import { describe, expect, it } from "vitest";
import { rbfaSquadGroups } from "@/lib/rbfaPublicSelection";

describe("aperçu de la sélection RBFA", () => {
  it("affiche toute la liste par poste sans masquer les postes absents", () => {
    const players = Array.from({ length: 12 }, (_, i) => ({ sourceId: String(i), playerId: String(i), name: `Joueur ${i}`, club: "Club" }));
    const playerDetails = Object.fromEntries(players.slice(0, 11).map((row, i) => [row.playerId, { position: i < 2 ? "Goalkeeper" : "Defender" }]));
    const groups = rbfaSquadGroups({ players, playerDetails });
    expect(groups.map((group) => [group.key, group.rows.length])).toEqual([["GK", 2], ["DEF", 9], ["OTHER", 1]]);
    expect(groups.flatMap((group) => group.rows)).toEqual(players);
  });
});
