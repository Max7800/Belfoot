import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ current: {} }));
vi.mock("@/lib/siteSettings", () => ({ updateSiteSettings: async (_db, patch) => {
  const changes = patch(state.current);
  if (!changes) return null;
  return state.current = { ...state.current, ...changes };
} }));
const { parseFifaSchedule, parseFifaRanking, syncFifaRanking, FIFA_RANKING_STATE } = await import("@/modules/football/fifaRankingSync");
const now = new Date("2026-11-21T12:00:00Z");
const page = (dates = [{ id: "FRS_Male_Football_20261007", iso: "2026-11-18T10:01:31Z" }]) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { pageData: { ranking: { dates: [{ dates }] } } } } })}</script>`;
const sample = () => ({ total: 200, rankings: Array.from({ length: 200 }, (_, i) => ({ rank: i + 1, totalPoints: 2000 - i, countryCode: i === 7 ? "BEL" : `${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}Z`, teamName: i === 7 ? "Belgium" : `Country ${i}` })) });
const fetcherFor = (data = sample()) => vi.fn(async (url) => new Response(url.includes("get-rankings") ? JSON.stringify(data) : page()));

describe("classement FIFA automatique", () => {
  it("sélectionne la dernière édition officielle publiée et ignore le futur", () => {
    expect(parseFifaSchedule(page([{ id: "id3", iso: "2027-01-01T00:00:00Z" }, { id: "id2", iso: "2026-11-18T00:00:00Z" }, { id: "id1", iso: "2026-10-07T00:00:00Z" }]), now)).toEqual({ id: "id2", publishedAt: "2026-11-18T00:00:00.000Z" });
    expect(() => parseFifaSchedule("no page", now)).toThrow();
  });
  it("accepte un classement complet et rejette les données manquantes ou incohérentes", () => {
    expect(parseFifaRanking(sample())[7]).toMatchObject({ rank: 8, points: 1993, code: "BEL" });
    const incomplete = sample(); incomplete.rankings.pop(); expect(() => parseFifaRanking(incomplete)).toThrow();
    const duplicate = sample(); duplicate.rankings[1].countryCode = "BEL"; expect(() => parseFifaRanking(duplicate)).toThrow();
    const wrongOrder = sample(); wrongOrder.rankings[1].totalPoints = 3000; expect(() => parseFifaRanking(wrongOrder)).toThrow();
  });
  it("importe une édition complète sans écraser la saisie manuelle puis attend une semaine", async () => {
    state.current = { rankings: { fifa: [{ nation: "Manuel" }] } };
    const fetcher = fetcherFor();
    expect(await syncFifaRanking(null, state.current, { now, fetcher })).toMatchObject({ ok: true, teams: 200 });
    expect(state.current.rankings.fifa[0].nation).toBe("Manuel");
    expect(state.current[FIFA_RANKING_STATE]).toMatchObject({ source: "FIFA", publishedAt: "2026-11-18T10:01:31.000Z" });
    expect(await syncFifaRanking(null, state.current, { now, fetcher })).toMatchObject({ skipped: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("conserve les données valides et ne retente pas avant 24 heures en cas d'échec", async () => {
    const entries = parseFifaRanking(sample()); state.current = { [FIFA_RANKING_STATE]: { entries, publishedAt: "2026-10-01T00:00:00Z" } };
    const result = await syncFifaRanking(null, state.current, { now, fetcher: async () => new Response("", { status: 503 }) });
    expect(result.ok).toBe(false); expect(state.current[FIFA_RANKING_STATE]).toMatchObject({ entries, attemptedAt: now.toISOString() });
    expect(await syncFifaRanking(null, state.current, { now, fetcher: vi.fn() })).toMatchObject({ skipped: true });
  });
  it("ne revient jamais à une édition plus ancienne et respecte la désactivation", async () => {
    state.current = { [FIFA_RANKING_STATE]: { publishedAt: "2026-12-01T00:00:00Z", entries: parseFifaRanking(sample()) } };
    expect((await syncFifaRanking(null, state.current, { now, fetcher: fetcherFor() })).ok).toBe(false);
    const fetcher = vi.fn(); expect(await syncFifaRanking(null, { football_fifa_rankings_enabled: false }, { now, fetcher })).toMatchObject({ skipped: true }); expect(fetcher).not.toHaveBeenCalled();
  });
});
