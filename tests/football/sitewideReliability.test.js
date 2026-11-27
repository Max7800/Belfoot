import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { loadSeasonMatches } from "@/lib/publicFootballData";
import { syncHealth } from "@/lib/syncHealth";

describe("lectures de compétition", () => {
  it("ne tronque pas une saison de plus de 1 000 matchs", async () => {
    const matches = Array.from({ length: 1205 }, (_, i) => ({ id: String(i).padStart(5, "0"), competition_id: "c", season_id: "s", kickoff: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }));
    const db = createFakeSupabase({ matches });
    const result = await loadSeasonMatches(db, "c", "s");
    expect(result).toHaveLength(1205);
    expect(result[0].id).toBe("00000");
    expect(result.at(-1).id).toBe("01204");
  });
});

describe("état des synchronisations", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  it("distingue absence, erreur, retard et classement désactivé", () => {
    const settings = { football_rbfa_monitor: {
      senior: { attemptedAt: "2026-11-22T11:55:00Z", observedAt: "2026-11-22T11:55:00Z", players: [{ playerId: "p" }] },
      u21: { attemptedAt: "2026-11-22T11:30:00Z", observedAt: "2026-11-22T10:00:00Z", error: "Source indisponible" },
      u19: { attemptedAt: "2026-11-21T08:00:00Z", observedAt: "2026-11-21T08:00:00Z" },
    }, football_fifa_rankings_enabled: false };
    const rows = syncHealth(settings, [], now).snapshots;
    expect(rows.find((r) => r.label === "RBFA · Diables Rouges").status).toBe("ok");
    expect(rows.find((r) => r.label === "RBFA · U21")).toMatchObject({ status: "error", error: "Source indisponible" });
    expect(rows.find((r) => r.label === "RBFA · U19").status).toBe("stale");
    expect(rows.find((r) => r.label === "RBFA · U18").status).toBe("missing");
    expect(rows.find((r) => r.label === "FIFA · classement mondial").status).toBe("disabled");
  });
  it("ne déclare pas valide un classement incomplet et conserve les derniers jobs par cible", () => {
    const settings = { football_fifa_rankings_auto: { checkedAt: "2026-11-22T11:00:00Z", entries: [{ code: "BEL" }] } };
    const jobs = [{ job_key: "squad", target_key: "a", status: "error" }, { job_key: "squad", target_key: "a", status: "ok" }, { job_key: "squad", target_key: "b", status: "ok" }];
    const result = syncHealth(settings, jobs, now);
    expect(result.snapshots.find((r) => r.label === "FIFA · classement mondial").status).toBe("missing");
    expect(result.jobs.map((j) => j.status)).toEqual(["error", "ok"]);
  });
  it("ne déclare pas un instantané valide si sa date ou sa liste est invalide", () => {
    const settings = { football_rbfa_monitor: { senior: { observedAt: "date invalide" } }, football_fifa_u17_2026_belgium: { observedAt: "2026-11-22T11:00:00Z", version: "v1", players: [] } };
    const rows = syncHealth(settings, [], now).snapshots;
    expect(rows.find((r) => r.label === "RBFA · Diables Rouges").status).toBe("missing");
    expect(rows.find((r) => r.label === "FIFA · Mondial U17 Belgique").status).toBe("missing");
  });
});
