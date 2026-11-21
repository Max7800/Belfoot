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
});
