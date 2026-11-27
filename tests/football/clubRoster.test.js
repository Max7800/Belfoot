import { describe, expect, it } from "vitest";
import { selectClubRoster } from "@/lib/clubRoster";

describe("effectif d'un club par saison", () => {
  const players = [{ id: "current" }, { id: "left" }, { id: "archive" }];
  const memberships = [
    { player_id: "current", season_start_year: 2026, active: true },
    { player_id: "left", season_start_year: 2026, active: false },
    { player_id: "archive", season_start_year: 2024, active: false },
  ];
  it("ne remplace pas une saison demandée et absente par l'effectif récent", () => {
    const result = selectClubRoster({ memberships, players, requestedYear: 2023, contextYear: 2026, currentYear: 2026 });
    expect(result.rosterYear).toBe(2023);
    expect(result.squad).toEqual([]);
  });
  it("distingue départs courants et joueurs d'une saison archivée", () => {
    expect(selectClubRoster({ memberships, players, contextYear: 2026, currentYear: 2026 }).squad.map((p) => p.id)).toEqual(["current"]);
    expect(selectClubRoster({ memberships, players, requestedYear: 2024, currentYear: 2026 }).squad.map((p) => p.id)).toEqual(["archive"]);
  });
  it("ne présente pas l'effectif actuel comme une archive sans affectations", () => {
    expect(selectClubRoster({ memberships: [], players, requestedYear: 2024, currentYear: 2026 }).squad).toEqual([]);
    expect(selectClubRoster({ memberships: [], players, requestedYear: 2026, currentYear: 2026 }).squad).toEqual(players);
  });
});
