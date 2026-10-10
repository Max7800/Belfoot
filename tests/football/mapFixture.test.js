import { describe, expect, it } from "vitest";
import { mapFixture } from "@/modules/football/apifootball";
import { rawFixture } from "../helpers/apiFootballFixtures";

describe("mapFixture", () => {
  it("conserve la saison API brute dans league_season", () => {
    expect(mapFixture(rawFixture({ id: 10, date: "2024-09-07T18:45:00+00:00", season: 2024 })).league_season).toBe(2024);
  });

  it("league_season vaut null si l'API ne fournit pas de saison", () => {
    expect(mapFixture(rawFixture({ id: 11, date: "2024-09-07T18:45:00+00:00" })).league_season).toBeNull();
  });

  it("ne change pas les autres champs (statut, score, ligue, équipes)", () => {
    const mapped = mapFixture(rawFixture({ id: 12, date: "2024-09-07T18:45:00+00:00", season: 2024, goals: { home: 2, away: 1 } }));
    expect(mapped).toMatchObject({
      external_id: "12",
      home_ext: "1",
      away_ext: "2",
      home_name: "Belgium",
      away_name: "France",
      home_score: 2,
      away_score: 1,
      status: "finished",
      status_short: "FT",
      minute: 90,
      round: "League A - 1",
      kickoff: "2024-09-07T18:45:00+00:00",
      league_ext: "5",
      league_name: "UEFA Nations League",
      league_country: "World",
    });
  });

  it("garde la correspondance des statuts utilisée par le direct", () => {
    const status = (short) => mapFixture(rawFixture({ id: 13, date: "2026-10-10T18:45:00+00:00", season: 2026, status: short })).status;
    expect(status("FT")).toBe("finished");
    expect(status("PEN")).toBe("finished");
    expect(status("1H")).toBe("live");
    expect(status("HT")).toBe("live");
    expect(status("NS")).toBe("scheduled");
    expect(status("TBD")).toBe("scheduled");
    expect(status("PST")).toBe("postponed");
  });
});
