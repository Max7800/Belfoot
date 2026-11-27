import { describe, expect, it, vi } from "vitest";
import { fifaFixtureInMatches, FIFA_U17_FIXTURES_KEY } from "@/lib/fifaU17Fixtures";

const state = vi.hoisted(() => ({ current: {} }));
vi.mock("@/lib/siteSettings", () => ({ updateSiteSettings: async (_db, update) => { const patch = update(state.current); if (patch) state.current = { ...state.current, ...patch }; return patch; } }));
const { parseFifaU17Calendar, syncFifaU17Fixtures } = await import("@/modules/football/fifaU17FixturesSync");
const team = (id, name) => ({ IdTeam: id, TeamName: [{ Locale: "en-GB", Description: name }] });
const match = (i) => ({ IdCompetition: "102", IdSeason: "292937", IdStage: "292957", IdMatch: String(i), TimeDefined: true, Date: "2026-11-30T13:30:00Z", Home: team(`h${i}`, i === 0 ? "Belgium" : `Home ${i}`), Away: team(`a${i}`, i === 0 ? "Saudi Arabia" : `Away ${i}`) });
const calendar = () => ({ ContinuationToken: null, Results: [...Array.from({ length: 16 }, (_, i) => match(i)), ...Array.from({ length: 88 }, () => ({ IdCompetition: "102", IdSeason: "292937", IdStage: "other" }))] });

describe("calendrier officiel FIFA du Mondial U17", () => {
  it("extrait les phases complètes et ignore les tours dont les équipes restent inconnues", () => {
    const stages = parseFifaU17Calendar(calendar());
    expect(stages["292957"]).toHaveLength(16);
    expect(stages["292957"][0]).toMatchObject({ home: { name: "Belgium" }, away: { name: "Saudi Arabia" }, kickoff: "2026-11-30T13:30:00Z" });
  });
  it("rejette la mauvaise édition, la pagination et les équipes en double", () => {
    const bad = calendar(); bad.Results[0].IdSeason = "bad";
    expect(() => parseFifaU17Calendar(bad)).toThrow();
    const duplicate = calendar(); duplicate.Results[1].Home = duplicate.Results[0].Home;
    expect(() => parseFifaU17Calendar(duplicate)).toThrow();
    expect(() => parseFifaU17Calendar({ ...calendar(), ContinuationToken: "more" })).toThrow();
  });
  it("évite les doublons même si les noms français et anglais diffèrent", () => {
    const official = parseFifaU17Calendar(calendar())["292957"][0];
    const clubs = { a: { name: "Belgique U17" }, b: { name: "Arabie saoudite U17" } };
    expect(fifaFixtureInMatches(official, [{ home_club_id: "a", away_club_id: "b", kickoff: official.kickoff }], clubs)).toBe(true);
    expect(fifaFixtureInMatches(official, [{ home_club_id: "a", away_club_id: "b", kickoff: "2026-12-10T13:30:00Z" }], clubs)).toBe(false);
  });
  it("conserve le dernier instantané lors d'une panne et limite les appels", async () => {
    state.current = {};
    const now = new Date("2026-11-27T22:00:00Z");
    const fetcher = vi.fn(async () => Response.json(calendar()));
    expect(await syncFifaU17Fixtures(null, state.current, { now, fetcher })).toMatchObject({ ok: true, stages: 1 });
    const saved = state.current[FIFA_U17_FIXTURES_KEY].stages;
    expect(await syncFifaU17Fixtures(null, state.current, { now, fetcher })).toMatchObject({ skipped: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await syncFifaU17Fixtures(null, state.current, { now: new Date("2026-11-27T23:00:00Z"), fetcher: async () => new Response("", { status: 503 }) })).toMatchObject({ ok: false });
    expect(state.current[FIFA_U17_FIXTURES_KEY].stages).toEqual(saved);
  });
});
