import { describe, expect, it } from "vitest";
import { missingMatchPlayerIds } from "@/lib/publicFootballData";

describe("joueurs des performances de match", () => {
  it("récupère une seule fois les joueurs absents des effectifs et statistiques de saison", () => {
    expect(missingMatchPlayerIds([{ id: "a" }], [{ player_id: "a" }, { player_id: "b" }, { player_id: "b" }, { player_id: null }, { player_id: "c" }])).toEqual(["b", "c"]);
    expect(missingMatchPlayerIds([], [{ player_id: "b" }])).toEqual(["b"]);
  });
});
