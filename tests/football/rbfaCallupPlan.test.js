import { describe, expect, it } from "vitest";
import { planRbfaCallups } from "@/modules/football/rbfaCallupPlan";

const matched = Array.from({ length: 11 }, (_, i) => ({ playerId: `p${i}` }));
const base = { officialCount: 11, matched, season: "2026-2027", existing: [] };

describe("préparation des convocations RBFA", () => {
  it("refuse une liste partiellement identifiée, dupliquée ou sans saison", () => {
    expect(planRbfaCallups({ ...base, matched: matched.slice(0, 10) }).ready).toBe(false);
    expect(planRbfaCallups({ ...base, matched: [...matched.slice(0, 10), matched[0]] }).ready).toBe(false);
    expect(planRbfaCallups({ ...base, season: "" }).ready).toBe(false);
  });
  it("prépare ajouts, réactivations et retraits sans modifier les objets", () => {
    const rows = [{ id: "old", player_id: "old", season: "2025-2026", source: "apifootball", active: true }, { id: "inactive", player_id: "p0", season: base.season, source: "rbfa", active: false }];
    const plan = planRbfaCallups({ ...base, existing: rows });
    expect(plan).toMatchObject({ ready: true, removals: ["old"], reactivations: ["inactive"] });
    expect(plan.additions).toHaveLength(10);
    expect(rows[0].active).toBe(true);
  });
  it("signale les corrections manuelles ou verrouillées en conflit", () => {
    const rows = [{ id: "manual", player_id: "outside", season: base.season, source: "manual", active: true }, { id: "locked", player_id: "p0", season: base.season, source: "apifootball", active: false, locked: true }];
    expect(planRbfaCallups({ ...base, existing: rows })).toMatchObject({ ready: false, protectedConflicts: ["manual", "locked"] });
  });
});
