import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ current: {} }));
vi.mock("@/lib/siteSettings", () => ({ updateSiteSettings: async (_db, patch) => { const changes = patch(state.current); if (!changes) return null; return state.current = { ...state.current, ...changes }; } }));
const { parseU21Draw, syncU21Draw } = await import("@/modules/football/uefaDrawSync");
const { UEFA_U21_DRAW_KEY } = await import("@/lib/uefaDraw");
const html = `<title>2027 Under 21 EURO final draw made</title><p><b>Group A</b>: Serbia (co-hosts), Poland, England (holders), France</p><p><b>Group B</b>: Albania (co-hosts), Spain, Italy, Finland</p><p><b>Group C</b>: Czechia, Portugal, Greece, Croatia</p><p><b>Group D</b>: Norway, Belgium, Germany, Netherlands</p>`;
const now = new Date("2026-11-27T00:00:00Z");
describe("tirage officiel Euro U21", () => {
  it("lit les quatre groupes sans inventer de classement", () => { const groups = parseU21Draw(html); expect(groups[3]).toEqual({ label: "Group D", teams: ["Norway", "Belgium", "Germany", "Netherlands"] }); expect(groups).toHaveLength(4); });
  it("rejette une source incomplète, incohérente ou ambiguë", () => { expect(() => parseU21Draw(html.replace("Netherlands", "Belgium"))).toThrow(); expect(() => parseU21Draw(html.replace("<p><b>Group C", "<p><b>Groupe C"))).toThrow(); expect(() => parseU21Draw(html + '<p>Group D: Norway, Belgium, Germany, Netherlands</p>')).toThrow(); });
  it("enregistre le tirage et limite les vérifications à une par jour", async () => { state.current = {}; const fetcher = vi.fn(async () => new Response(html)); expect(await syncU21Draw(null, state.current, { now, fetcher })).toMatchObject({ ok: true, groups: 4 }); expect(state.current[UEFA_U21_DRAW_KEY].observedAt).toBe(now.toISOString()); expect(await syncU21Draw(null, state.current, { now, fetcher })).toMatchObject({ skipped: true }); expect(fetcher).toHaveBeenCalledTimes(1); });
  it("conserve le tirage en cas d'échec et arrête après le début du tournoi", async () => { const groups = parseU21Draw(html); state.current = { [UEFA_U21_DRAW_KEY]: { groups, observedAt: "2026-11-25T00:00:00Z" } }; expect(await syncU21Draw(null, state.current, { now, fetcher: async () => new Response("", { status: 503 }) })).toMatchObject({ ok: false }); expect(state.current[UEFA_U21_DRAW_KEY].groups).toEqual(groups); const fetcher = vi.fn(); expect(await syncU21Draw(null, state.current, { now: new Date("2027-06-16T00:00:00Z"), fetcher })).toMatchObject({ skipped: true }); expect(fetcher).not.toHaveBeenCalled(); });
});
