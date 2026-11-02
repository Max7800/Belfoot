import { describe, expect, it } from "vitest";
import { nextClubFixture } from "@/lib/clubOverview";

describe("prochain match dans l'aperçu d'un club", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  it("choisit le match programmé le plus proche et exclut les matchs passés ou reportés", () => {
    const matches = [
      { id: "past", status: "scheduled", kickoff: "2026-11-01T10:00:00Z" },
      { id: "postponed", status: "postponed", kickoff: "2026-11-01T13:00:00Z" },
      { id: "cancelled", ext: { status_short: "CANC" }, kickoff: "2026-11-01T13:30:00Z" },
      { id: "later", status: "scheduled", kickoff: "2026-11-04T12:00:00Z" },
      { id: "next", status: "scheduled", kickoff: "2026-11-02T12:00:00Z" },
      { id: "undated", status: "scheduled", kickoff: null },
    ];
    expect(nextClubFixture(matches, now)?.id).toBe("next");
    expect(matches[0].id).toBe("past");
  });
  it("ne fabrique pas de match lorsque les données sont absentes", () => {
    expect(nextClubFixture([], now)).toBeNull();
    expect(nextClubFixture([{ status: "finished", kickoff: "2026-11-02T12:00:00Z" }], now)).toBeNull();
  });
});
