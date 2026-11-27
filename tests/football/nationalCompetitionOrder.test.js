import { describe, expect, it } from "vitest";
import { sortNationalCompetitions, prioritizeResultCompetition } from "@/lib/nationalCompetitionOrder";

describe("classements d'une sélection", () => {
  it("place le tournoi en cours avant les anciennes qualifications sans muter la liste", () => {
    const now = Date.parse("2026-11-21T12:00:00Z");
    const old = { compId: "qualifs", matches: [{ kickoff: "2026-03-10T12:00:00Z" }] };
    const current = { compId: "mondial", matches: [{ kickoff: "2026-11-20T12:00:00Z" }, { kickoff: "2026-11-26T12:00:00Z" }] };
    const input = [old, current];
    expect(sortNationalCompetitions(input, now).map((item) => item.compId)).toEqual(["mondial", "qualifs"]);
    expect(input[0]).toBe(old);
  });
  it("place la dernière compétition jouée avant les anciennes hors période active", () => {
    const now = Date.parse("2026-11-21T12:00:00Z");
    expect(sortNationalCompetitions([{ compId: "old", matches: [{ kickoff: "2025-01-01" }] }, { compId: "new", matches: [{ kickoff: "2026-03-01" }] }], now).map((item) => item.compId)).toEqual(["new", "old"]);
  });
});

it("présente le groupe lié au dernier résultat, avec repli si ce match n'a pas de classement", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  const tables = [{ compId: "qualifs", matches: [{ kickoff: "2026-11-21T11:00:00Z" }] }, { compId: "mondial", matches: [{ kickoff: "2026-11-20T12:00:00Z" }] }];
  expect(prioritizeResultCompetition(tables, "mondial", now).map((item) => item.compId)).toEqual(["mondial", "qualifs"]);
  expect(prioritizeResultCompetition(tables, "amicaux", now).map((item) => item.compId)).toEqual(["qualifs", "mondial"]);
});
