import { describe, expect, it } from "vitest";
import { fifaU17Roster } from "@/lib/fifaU17Roster";

describe("liste FIFA Belgique U17", () => {
  it("réserve les 21 joueurs officiels à la bonne compétition et à la bonne saison", () => {
    const comp = "d7088941-8ca5-4d6f-aa3d-c3724d44ba2b";
    const team = "1880918a-1176-4471-8056-b4b67f3a12e1";
    const roster = fifaU17Roster(comp, "2026-2027", team);
    expect(roster).toHaveLength(21);
    expect(new Set(roster.map((p) => p.rosterKey)).size).toBe(21);
    expect(roster.map((p) => p.name)).toContain("Esteban Levaux");
    expect(roster.map((p) => p.name)).not.toContain("Jayden Onia Seke");
    expect(roster.every((p) => p.id === null)).toBe(true);
    expect(fifaU17Roster(comp, "2025-2026", team)).toBeNull();
    expect(fifaU17Roster(comp, "2026-2027", "other")).toBeNull();
    expect(fifaU17Roster("other", "2026-2027", team)).toBeNull();
  });
});
