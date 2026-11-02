import { describe, expect, it } from "vitest";
import { formatProviderCountry, isRecentPerformance, loadAbroadPerformances, searchText } from "@/lib/abroadExperience";

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
  it("répartit les joueurs en lots bornés et retire les doublons", async () => {
    const calls = [];
    const db = { rpc: async (_name, { p_player_ids }) => { calls.push(p_player_ids); return { data: p_player_ids.map((id) => ({ id })) }; } };
    const ids = Array.from({ length: 81 }, (_, i) => String(i));
    const result = await loadAbroadPerformances(db, [...ids, ids[0]], "fields");
    expect(calls.map((x) => x.length)).toEqual([80, 1]);
    expect(result.data).toHaveLength(81);
    expect(result.limited).toBe(false);
  });
  it("se replie seulement si la fonction n'est pas installée", async () => {
    const query = { select: () => query, in: () => query, order: () => query, limit: async () => ({ data: [{ id: "x" }] }) };
    const db = { rpc: async () => ({ error: { code: "PGRST202" } }), from: () => query };
    expect(await loadAbroadPerformances(db, ["x"], "id")).toEqual({ data: [{ id: "x" }], limited: true });
    await expect(loadAbroadPerformances({ rpc: async () => ({ error: new Error("indisponible") }) }, ["x"], "id")).rejects.toThrow("indisponible");
  });
});
