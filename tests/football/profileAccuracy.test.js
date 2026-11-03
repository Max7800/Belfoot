import { describe, expect, it } from "vitest";
import { performanceDisplay } from "@/lib/playerPerformanceDisplay";
import { loadClubsForMatches } from "@/lib/publicFootballData";
import { createFakeSupabase } from "../helpers/fakeSupabase";

describe("données affichées sur les fiches", () => {
  it("ne transforme pas une note absente ou nulle en 0,0", () => {
    expect(performanceDisplay({ minutes: 0, rating: 0 })).toEqual({ minutes: 0, rating: null });
    expect(performanceDisplay({ minutes: null, rating: null })).toEqual({ minutes: null, rating: null });
    expect(performanceDisplay({ minutes: 89, rating: "9.0" })).toEqual({ minutes: 89, rating: 9 });
  });
  it("charge les clubs de tous les matchs, même au-delà d'un paquet", async () => {
    const clubs = Array.from({ length: 170 }, (_, i) => ({ id: `club-${i}`, name: `Club ${i}` }));
    const matches = clubs.map((club) => ({ home_club_id: "club-0", away_club_id: club.id }));
    const db = createFakeSupabase({ clubs }, { maxRows: 1000 });
    const result = await loadClubsForMatches(db, matches);
    expect(Object.keys(result)).toHaveLength(170);
    expect(result["club-169"].name).toBe("Club 169");
  });
});
