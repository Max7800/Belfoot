import { describe, expect, it } from "vitest";
import { eventRankings } from "@/lib/eventRankings";

describe("classements indicatifs des événements", () => {
  it("compte buts et passes par nom et équipe, exclut les buts contre son camp et les équipes inconnues", () => {
    const result = eventRankings([
      { type: "goal", club_id: "a", player_name: "Alpha", assist_name: "Beta" },
      { type: "goal", club_id: "a", player_name: "Alpha", assist_name: null },
      { type: "goal", club_id: "a", player_name: "Alpha", assist_name: "Beta", detail: "Own Goal" },
      { type: "goal", club_id: "b", player_name: "Alpha", assist_name: "Gamma" },
      { type: "goal", club_id: null, player_name: "Alpha" },
      { type: "yellow", club_id: "a", player_name: "Alpha" },
    ]);
    expect(result.scorers.map((row) => [row.name, row.clubId, row.total])).toEqual([["Alpha", "a", 2], ["Alpha", "b", 1]]);
    expect(result.assists.map((row) => [row.name, row.total])).toEqual([["Beta", 1], ["Gamma", 1]]);
  });
});
