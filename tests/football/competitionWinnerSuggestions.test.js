import { describe, expect, it } from "vitest";
import { loadCupWinnerSuggestions } from "@/lib/competitionWinnerSuggestions";
import { createFakeSupabase } from "../helpers/fakeSupabase";

describe("analyse administrative des finales en base", () => {
  it("propose uniquement les saisons importées et ne modifie aucune donnée", async () => {
    const db = createFakeSupabase({ seasons: [{ id: "s1", label: "2024-2025", competition_id: "c" }, { id: "s2", label: "2023-2024", competition_id: "c" }], clubs: [{ id: "a", name: "Club A" }], matches: [{ id: "m", competition_id: "c", season_id: "s1", round_raw: "Final", status: "finished", home_club_id: "a", away_club_id: "b", home_score: 2, away_score: 1, ext: { status_short: "FT" } }] });
    const items = await loadCupWinnerSuggestions(db, { id: "c", competition_type: "cup", ext: { full_competition_seasons: { "2024-2025": "date" } } });
    expect(items).toEqual([{ season: "2024-2025", status: "candidate", winner: "Club A", matchId: "m" }, { season: "2023-2024", status: "needs_review", reason: "Import complet non confirmé" }]);
    expect(db.rows("matches")).toHaveLength(1);
  });
  it("écarte une double finale et une équipe inconnue", async () => {
    const m = { competition_id: "c", season_id: "s", round_raw: "Final", status: "finished", home_club_id: "a", away_club_id: "b", home_score: 2, away_score: 1, ext: { status_short: "FT" } };
    const db = createFakeSupabase({ seasons: [{ id: "s", label: "2024", competition_id: "c" }], matches: [{ ...m, id: "m1" }, { ...m, id: "m2" }], clubs: [] });
    expect(await loadCupWinnerSuggestions(db, { id: "c", competition_type: "cup", ext: { full_competition_seasons: { "2024": "date" } } })).toMatchObject([{ status: "needs_review", reason: "finale_ambigue" }]);
  });
});
