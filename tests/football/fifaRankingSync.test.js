import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ current: {} }));
vi.mock("@/lib/siteSettings", () => ({ updateSiteSettings: async (_db, patch) => {
  const changes = patch(state.current);
  if (!changes) return null;
  return state.current = { ...state.current, ...changes };
} }));
const { parseFifaRanking, syncFifaRanking, FIFA_RANKING_STATE } = await import("@/modules/football/fifaRankingSync");
const sample = () => ({ rankings: [{ gender: "men", competitor_rankings: Array.from({ length: 200 }, (_, i) => ({ rank: i + 1, points: 2000 - i, competitor: { country_code: i === 7 ? "BEL" : `${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}Z`, name: i === 7 ? "Belgium" : `Country ${i}` } })) }] });
const now = new Date("2026-11-21T12:00:00Z");

describe("classement FIFA automatique", () => {
  it("lit la Belgique et refuse une réponse incomplète ou ambiguë", () => {
    expect(parseFifaRanking(sample())[7]).toMatchObject({ rank: 8, points: 1993, code: "BEL", isBelgium: true });
    const incomplete = sample(); incomplete.rankings[0].competitor_rankings.length = 10;
    expect(() => parseFifaRanking(incomplete)).toThrow();
    const duplicate = sample(); duplicate.rankings[0].competitor_rankings[1].competitor.country_code = "BEL";
    expect(() => parseFifaRanking(duplicate)).toThrow();
  });
  it("ne fait aucun appel sans activation et clé", async () => {
    const fetcher = vi.fn();
    expect(await syncFifaRanking(null, { football_fifa_rankings_enabled: false }, { now, key: "test", fetcher })).toMatchObject({ skipped: true });
    expect(await syncFifaRanking(null, { football_fifa_rankings_enabled: true }, { now, key: "", fetcher })).toMatchObject({ skipped: true });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("enregistre un snapshot complet sans modifier les réglages manuels et respecte l'intervalle", async () => {
    state.current = { rankings: { fifa: [{ nation: "Manuel" }] } };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(sample())));
    expect(await syncFifaRanking(null, { football_fifa_rankings_enabled: true }, { now, key: "test", fetcher })).toMatchObject({ ok: true, teams: 200 });
    expect(state.current.rankings.fifa[0].nation).toBe("Manuel");
    expect(state.current[FIFA_RANKING_STATE].entries).toHaveLength(200);
    expect(await syncFifaRanking(null, { ...state.current, football_fifa_rankings_enabled: true }, { now, key: "test", fetcher })).toMatchObject({ skipped: true, reason: "intervalle" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("garde le dernier classement valide si le fournisseur échoue", async () => {
    const entries = parseFifaRanking(sample());
    state.current = { [FIFA_RANKING_STATE]: { entries, checkedAt: "2026-11-01T00:00:00Z" } };
    const result = await syncFifaRanking(null, { ...state.current, football_fifa_rankings_enabled: true }, { now, key: "test", fetcher: async () => new Response("invalid", { status: 503 }) });
    expect(result.ok).toBe(false);
    expect(state.current[FIFA_RANKING_STATE]).toMatchObject({ entries, checkedAt: "2026-11-01T00:00:00Z", attemptedAt: now.toISOString() });
  });
});
