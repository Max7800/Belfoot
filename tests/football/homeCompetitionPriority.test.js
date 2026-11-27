import { describe, expect, it } from "vitest";
import { rankHomeCompetitions } from "@/lib/homeCompetitionPriority";

const now = Date.parse("2026-11-22T12:00:00Z");
const candidate = (id, kickoff, status = "scheduled", extra = {}) => ({ competition: { id, name: id, position: 1 }, matches: [{ kickoff, status, ...extra }] });

describe("compétitions à la une", () => {
  it("classe les matchs actuels et écarte les compétitions achevées, même épinglées", () => {
    const rows = [candidate("qualifs", "2026-10-05T12:00:00Z", "finished"), candidate("D2", "2026-11-23T12:00:00Z"), candidate("Pro", "2026-11-22T10:00:00Z", "live"), candidate("UEFA", "2026-11-26T12:00:00Z")];
    expect(rankHomeCompetitions(rows, { now, featuredId: "qualifs" }).map((r) => r.competition.id)).toEqual(["Pro", "D2", "UEFA"]);
  });
  it("limite à cinq et utilise la préférence comme départage", () => {
    const rows = Array.from({ length: 8 }, (_, i) => candidate(String(i), "2026-11-23T12:00:00Z"));
    const result = rankHomeCompetitions(rows, { now, featuredId: "7" });
    expect(result).toHaveLength(5);
    expect(result[0].competition.id).toBe("7");
  });
  it("ignore les dates éloignées, invalides, reportées et rencontres passées non finalisées", () => {
    const rows = [candidate("loin", "2027-03-25T19:45:00Z"), candidate("date", "invalid"), candidate("report", "2026-11-23T12:00:00Z", "postponed"), candidate("nonjoue", "2026-11-21T12:00:00Z")];
    expect(rankHomeCompetitions(rows, { now })).toEqual([]);
  });
});
