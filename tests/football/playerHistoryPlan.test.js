import { describe, expect, it } from "vitest";
import { historySeasons, playerHistoryPlan } from "@/modules/football/playerHistoryPlan";

describe("périmètre des historiques", () => {
  it("détermine les cinq saisons précédentes selon le calendrier sportif", () => {
    expect(historySeasons(new Date("2026-11-01T00:00:00Z"))).toEqual(["2021", "2022", "2023", "2024", "2025"]);
    expect(historySeasons(new Date("2026-03-01T00:00:00Z"))).toEqual(["2020", "2021", "2022", "2023", "2024"]);
  });
  it("réutilise les saisons réussies et distingue les erreurs des données absentes", () => {
    const player = { career_synced_at: "2026-01-01", career_sync_status: "ok", ext: { career_stats_seasons: { 2022: "2026-01-01", 2024: "error" } } };
    expect(playerHistoryPlan(player, new Date("2026-11-01T00:00:00Z"))).toEqual({
      seasons: ["2021", "2022", "2023", "2024", "2025"],
      missing: ["2021", "2023", "2025"], failed: ["2024"], complete: ["2022"], careerMissing: false,
    });
    expect(playerHistoryPlan({ ...player, career_sync_status: "error" }, new Date("2026-11-01T00:00:00Z")).careerMissing).toBe(true);
    expect(playerHistoryPlan({ ...player, career_sync_status: "running" }, new Date("2026-11-01T00:00:00Z")).careerMissing).toBe(true);
  });
});
