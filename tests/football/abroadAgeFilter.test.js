import { describe, expect, it } from "vitest";
import { abroadPlayerAge, matchesAbroadAge } from "@/lib/abroadAgeFilter";

describe("filtre d'âge des Belges à l'étranger", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  it("respecte l'anniversaire et la limite exclusive", () => {
    expect(matchesAbroadAge({ birth_date: "2005-11-27" }, "21", now)).toBe(true);
    expect(matchesAbroadAge({ birth_date: "2005-11-26" }, "21", now)).toBe(false);
    expect(matchesAbroadAge({ birth_date: "2008-11-27" }, "18", now)).toBe(true);
  });
  it("isole les dates absentes ou invalides sans utiliser l'âge potentiellement périmé", () => {
    for (const player of [{ age: 19 }, { birth_date: "2006-02-30" }, { birth_date: "2030-01-01" }]) {
      expect(abroadPlayerAge(player, now)).toBeNull();
      expect(matchesAbroadAge(player, "unknown", now)).toBe(true);
      expect(matchesAbroadAge(player, "23", now)).toBe(false);
    }
  });
});
