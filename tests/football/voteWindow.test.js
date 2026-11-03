import { describe, expect, it } from "vitest";
import { voteWindow, voteWindowLabel } from "@/lib/voteWindow";
import { uefaPointsDisplay } from "@/lib/rankingDisplay";

describe("état temporel du vote", () => {
  const session = { status: "open", opens_at: "2026-11-03T10:00:00Z", closes_at: "2026-11-03T12:00:00Z" };
  const at = (value) => Date.parse(value);
  it("distingue ouverture à venir, vote ouvert et fermeture à l'heure limite", () => {
    expect(voteWindow(session, at("2026-11-03T09:59:59Z"))).toBe("upcoming");
    expect(voteWindow(session, at("2026-11-03T10:00:00Z"))).toBe("open");
    expect(voteWindow(session, at("2026-11-03T12:00:00Z"))).toBe("closed");
    expect(voteWindowLabel(voteWindow(session, at("2026-11-03T12:00:00Z")))).toBe("vote fermé");
  });
  it("respecte les statuts, l'absence de limites et les dates invalides", () => {
    expect(voteWindow({ status: "open" })).toBe("open");
    expect(voteWindow({ status: "published" })).toBe("published");
    expect(voteWindow({ status: "closed" })).toBe("closed");
    expect(voteWindow({ status: "open", opens_at: "incorrect" })).toBe("unavailable");
    expect(voteWindow({ ...session, opens_at: session.closes_at })).toBe("unavailable");
  });
});

describe("coefficient UEFA saisi", () => {
  it("préserve les décimales lisibles et signale une valeur ambiguë sans la modifier", () => {
    expect(uefaPointsDisplay("59.450")).toEqual({ text: "59.450", valid: true });
    expect(uefaPointsDisplay("59,450")).toEqual({ text: "59,450", valid: true });
    expect(uefaPointsDisplay("59450")).toEqual({ text: "Valeur à vérifier", valid: false });
    expect(uefaPointsDisplay("")).toEqual({ text: "", valid: true });
    expect(uefaPointsDisplay("inconnu").valid).toBe(false);
  });
});
