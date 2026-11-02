import { describe, expect, it } from "vitest";
import { formatProviderCountry, isRecentPerformance, searchText } from "@/lib/abroadExperience";

describe("page des Belges : recherche et performances", () => {
  it("ignore les accents et la casse sans modifier le nom affiché", () => {
    expect(searchText("  De Ketelaeré  ")).toBe("de ketelaere");
    expect(searchText("Àlex")).toBe(searchText("alex"));
  });
  it("n'utilise une performance récente que si la date est connue, passée et dans la fenêtre", () => {
    const now = Date.parse("2026-11-02T00:00:00Z");
    expect(isRecentPerformance({ kickoff: "2026-10-30T20:00:00Z" }, now)).toBe(true);
    expect(isRecentPerformance({ kickoff: "2026-01-01T00:00:00Z" }, now)).toBe(false);
    expect(isRecentPerformance({ kickoff: "2027-01-01T00:00:00Z" }, now)).toBe(false);
    expect(isRecentPerformance({}, now)).toBe(false);
  });
  it("normalise les pays séparés par des tirets avant traduction", () => {
    expect(formatProviderCountry("Saudi-Arabia")).toBe("Saudi Arabia");
    expect(formatProviderCountry("United-Arab-Emirates")).toBe("United Arab Emirates");
  });
});
