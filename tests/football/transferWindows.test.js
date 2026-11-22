import { describe, expect, it } from "vitest";
import { dateInZone, transferWindowId, transferWindowsFor, windowStatus } from "@/lib/transferWindows";

describe("périodes de transfert", () => {
  const comp = { provider: "apifootball", external_id: "144" };
  const info = transferWindowsFor(comp, 2026);
  it("ne réutilise jamais les dates dans une autre saison, compétition ou fournisseur", () => {
    expect(info.periods).toHaveLength(2);
    expect(transferWindowsFor({ ...comp, external_id: "145" }, 2026)).not.toBeNull();
    expect(transferWindowsFor(comp, 2027)).toBeNull();
    expect(transferWindowsFor({ ...comp, external_id: "146" }, 2026)).toBeNull();
    expect(transferWindowsFor({ ...comp, provider: "other" }, 2026)).toBeNull();
  });
  it("tient compte de la date locale belge et inclut les deux dates limites", () => {
    const winter = info.periods[1];
    expect(dateInZone(new Date("2027-01-01T23:30:00Z"), info.timeZone)).toBe("2027-01-02");
    expect(windowStatus(winter, "2027-01-01")).toBe("upcoming");
    expect(windowStatus(winter, "2027-01-02")).toBe("open");
    expect(windowStatus(winter, "2027-02-03")).toBe("open");
    expect(windowStatus(winter, "2027-02-04")).toBe("closed");
  });
  it("classe les mouvements sans masquer les dates hors période ou incertaines", () => {
    expect(transferWindowId({ transfer_date: "2026-06-17" }, info.periods)).toBe("summer");
    expect(transferWindowId({ transfer_date: "2027-02-03" }, info.periods)).toBe("winter");
    expect(transferWindowId({ transfer_date: "2026-10-01" }, info.periods)).toBe("outside");
    expect(transferWindowId({ transfer_date: "2026-06-17", transfer_date_uncertain: true }, info.periods)).toBe("uncertain");
    expect(transferWindowId({ transfer_date: "2026-02-30" }, info.periods)).toBe("uncertain");
  });
});
