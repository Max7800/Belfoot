import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { loadSeasonMatches } from "@/lib/publicFootballData";
import { syncHealth } from "@/lib/syncHealth";
import { upcomingInternationalDraws } from "@/lib/internationalDrawWatch";

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
  it("signale les tirages absents ou en erreur sans les présenter comme à jour", () => {
    const settings = { football_fifa_u17_2026_fixtures: { observedAt: "2026-11-22T11:00:00Z", stages: {} }, football_uefa_u21_2027_draw: { observedAt: "2026-11-22T11:00:00Z", error: "Source indisponible" } };
    const rows = syncHealth(settings, [], now).snapshots;
    expect(rows.find((row) => row.label === "FIFA · programme Mondial U17").status).toBe("missing");
    expect(rows.find((row) => row.label === "UEFA · tirage Euro U21 2027").status).toBe("error");
  });
  it("classe un programme FIFA périmé et conserve les archives", () => {
    const matches = Array.from({ length: 16 }, (_, i) => ({ id: String(i), kickoff: "2026-11-30T13:30:00Z", home: { id: `h${i}`, name: `h${i}` }, away: { id: `a${i}`, name: `a${i}` } }));
    const settings = { football_fifa_u17_2026_fixtures: { observedAt: "2026-11-22T08:00:00Z", stages: { "292957": matches } } };
    expect(syncHealth(settings, [], now).snapshots.find((row) => row.label === "FIFA · programme Mondial U17").status).toBe("stale");
    expect(syncHealth(settings, [], Date.parse("2026-12-29T12:00:00Z")).snapshots.find((row) => row.label === "FIFA · programme Mondial U17")).toMatchObject({ status: "ok", extra: "1 phase(s) complète(s) · archive" });
  });
  it("distingue les échéances passées des prochaines sans leur attribuer une automatisation", () => {
    const before = upcomingInternationalDraws(Date.parse("2026-12-05T00:00:00Z"));
    expect(before).toHaveLength(3);
    expect(before.every((draw) => draw.status === "upcoming" && !draw.automatic)).toBe(true);
    const after = upcomingInternationalDraws(Date.parse("2026-12-07T00:00:00Z"));
    expect(after.find((draw) => draw.id === "euro-2028-qualifying").status).toBe("check");
    expect(upcomingInternationalDraws(Date.parse("2027-02-01T00:00:00Z"))).toHaveLength(0);
  });
});
