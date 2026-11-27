import { describe, expect, it, vi } from "vitest";
import { readFollowedPlayers, readOverviewCompetitions } from "@/lib/footballOverviewReads";

describe("lectures partagées de l'accueil", () => {
  it("partage les joueurs simultanément demandés, puis relit après résolution", async () => {
    let done;
    const request = new Promise((resolve) => { done = resolve; });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: request.then.bind(request) };
    const db = { from: vi.fn(() => query) };
    const a = readFollowedPlayers(db), b = readFollowedPlayers(db);
    expect(db.from).toHaveBeenCalledTimes(1);
    done({ data: [{ id: "p" }], error: null });
    expect(await a).toEqual(await b);
    await readFollowedPlayers(db);
    expect(db.from).toHaveBeenCalledTimes(2);
  });
  it("ne confond pas compétitions et joueurs", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (resolve) => resolve({ data: [] }) };
    const db = { from: vi.fn(() => query) };
    await Promise.all([readFollowedPlayers(db), readOverviewCompetitions(db)]);
    expect(db.from.mock.calls.map((args) => args[0])).toEqual(["players", "competitions"]);
  });
});
