import { describe, expect, it } from "vitest";
import { geoName, groupMapPlayers } from "@/lib/belgiansMapGroups";

describe("regroupement des pays sur la carte", () => {
  it("regroupe les nations britanniques en nommant le Royaume-Uni correctement", () => {
    const players = [{ country: "England", player: { id: "a" } }, { country: "Scotland", player: { id: "b" } }, { country: "France", player: { id: "c" } }, { country: "Pays non précisé" }];
    const result = groupMapPlayers(players, "Pays non précisé");
    expect(result["United Kingdom"].label).toBe("Royaume-Uni");
    expect(result["United Kingdom"].list.map((item) => item.player.id)).toEqual(["a", "b"]);
    expect(result.France.list).toHaveLength(1);
    expect(Object.keys(result)).toHaveLength(2);
    expect(geoName("England")).toBe("United Kingdom");
  });
});
