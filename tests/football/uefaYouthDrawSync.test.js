import { describe, expect, it, vi } from "vitest";
import { INTERNATIONAL_DRAW_EVENTS, UEFA_DRAW_SNAPSHOTS_KEY, validStoredUefaDraw } from "@/lib/internationalDrawWatch";
const fake = vi.hoisted(() => ({ settings: {} }));
vi.mock("@/lib/siteSettings", () => ({ updateSiteSettings: async (_db, update) => { const patch = update(fake.settings); if (patch) fake.settings = { ...fake.settings, ...patch }; return patch; } }));
const { parseUefaDraw, syncUefaYouthDraws } = await import("@/modules/football/uefaYouthDrawSync");
const event = INTERNATIONAL_DRAW_EVENTS.find((item) => item.category === "u19");
const build = () => Array.from({ length: 7 }, (_, group) => {
  const teams = Array.from({ length: 4 }, (_, index) => {
    const n = group * 4 + index;
    const code = n === 0 ? "BEL" : `A${String.fromCharCode(65 + Math.floor(n / 26))}${String.fromCharCode(65 + n % 26)}`;
    return { id: String(n), countryCode: code, translations: { countryName: { FR: `Équipe ${n}` } } };
  });
  return { group: { id: `group${group}`, roundId: event.round, competitionId: event.uefaCompetition, seasonYear: event.uefaSeason, phase: "QUALIFYING", teams: teams.map((team) => team.id), translations: { name: { FR: `Groupe ${group + 1}` } } }, items: teams.map((team) => ({ team })) };
});
describe("tirages UEFA de jeunes", () => {
  it("isole le bon tour et valide les 28 équipes", () => {
    const rows = build(), old = structuredClone(rows[0]); old.group.roundId = "ancien";
    const groups = parseUefaDraw([old, ...rows], event);
    expect(groups).toHaveLength(7);
    expect(validStoredUefaDraw(event, groups)).toBe(true);
  });
  it("attend un tour incomplet et rejette une équipe dupliquée", () => {
    expect(parseUefaDraw(build().slice(0, 6), event)).toBeNull();
    const rows = build(); rows[1].items[0].team.countryCode = "BEL";
    expect(() => parseUefaDraw(rows, event)).toThrow();
    const bad = build(); bad[0].group.seasonYear = "2026";
    expect(() => parseUefaDraw(bad, event)).toThrow();
  });
  it("ne lance rien avant la date et conserve un tirage valide après une erreur", async () => {
    fake.settings = {};
    const fetcher = vi.fn(async () => Response.json(build()));
    expect(await syncUefaYouthDraws(null, fake.settings, { now: new Date("2026-12-09T10:00:00Z"), fetcher })).toMatchObject({ skipped: true });
    expect(fetcher).not.toHaveBeenCalled();
    const now = new Date("2026-12-10T10:45:00Z");
    expect(await syncUefaYouthDraws(null, fake.settings, { now, fetcher })).toMatchObject({ ok: true, event: event.id, groups: 7 });
    const previous = fake.settings[UEFA_DRAW_SNAPSHOTS_KEY][event.id].groups;
    fake.settings[UEFA_DRAW_SNAPSHOTS_KEY]["u17-2027-round2"] = { attemptedAt: "2026-12-11T10:59:00Z" };
    expect(await syncUefaYouthDraws(null, fake.settings, { now: new Date("2026-12-11T11:00:00Z"), fetcher: async () => new Response("", { status: 503 }) })).toMatchObject({ ok: false, event: event.id });
    expect(fake.settings[UEFA_DRAW_SNAPSHOTS_KEY][event.id].groups).toEqual(previous);
  });
  it("alterne les deux sources en attente même si le cron ne passe que toutes les 30 minutes", async () => {
    fake.settings = {};
    const fetcher = vi.fn(async () => Response.json([]));
    const first = await syncUefaYouthDraws(null, fake.settings, { now: new Date("2026-12-10T12:00:00Z"), fetcher });
    const second = await syncUefaYouthDraws(null, fake.settings, { now: new Date("2026-12-10T12:30:00Z"), fetcher });
    expect(first).toMatchObject({ event: "u19-2027-round3", pending: true });
    expect(second).toMatchObject({ event: "u17-2027-round2", pending: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
