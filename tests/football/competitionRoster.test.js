import { describe, expect, it } from "vitest";
import { matchRosterByTeam } from "@/lib/competitionRoster";

describe("joueurs identifiés par sélection", () => {
  it("déduplique les apparitions sans mélanger les équipes ni inventer les fiches absentes", () => {
    const players = [{ id: "p1", name: "A" }, { id: "p2", name: "B" }];
    const teams = matchRosterByTeam([{ club_id: "a", player_id: "p1" }, { club_id: "a", player_id: "p1" }, { club_id: "b", player_id: "p2" }, { club_id: "a", player_id: null }, { club_id: "a", player_id: "missing" }, { club_id: null, player_id: "p2" }], players);
    expect([...teams.get("a").keys()]).toEqual(["p1"]);
    expect([...teams.get("b").keys()]).toEqual(["p2"]);
    expect(teams.size).toBe(2);
  });
  it("affiche les noms non reliés par identifiant fournisseur, sans inventer de fiche ni fusionner des homonymes", () => {
    const rows = [
      { club_id: "a", source: "api", player_external_id: "1", player_name: "A" },
      { club_id: "a", source: "api", player_external_id: "1", player_name: "A" },
      { club_id: "a", source: "api", player_external_id: "2", player_name: "A" },
      { club_id: "a", source: "api", player_external_id: "3", player_name: "B" },
      { club_id: "a", source: "api", player_external_id: "3", player_id: "p3", player_name: "B" },
      { club_id: "a", player_name: "Sans identifiant" },
    ];
    const roster = [...matchRosterByTeam(rows, [{ id: "p3", name: "B" }]).get("a").values()];
    expect(roster).toHaveLength(3);
    expect(roster.filter((p) => !p.id).map((p) => p.name)).toEqual(["A", "A"]);
    expect(roster.find((p) => p.id === "p3").name).toBe("B");
  });
});
