import { describe, expect, it } from "vitest";
import { sortNationalCompetitions, prioritizeResultCompetition, nationalStandingSeason, orderNationalStandings } from "@/lib/nationalCompetitionOrder";

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

it("retient l'édition du match affiché plutôt qu'une édition future", () => {
  const matches = [
    { competition_id: "nl", season_id: "2026", kickoff: "2026-11-15" },
    { competition_id: "nl", season_id: "2028", kickoff: "2028-09-01" },
  ];
  expect(nationalStandingSeason(matches, matches[0])).toBe("2026");
  expect(nationalStandingSeason(matches, { competition_id: "autre", season_id: "2026" })).toBe("2028");
  expect(nationalStandingSeason(matches, null)).toBe("2028");
});

it("priorise la compétition et la saison du direct ; signale un repli non lié", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  const tables = [
    { compId: "qualifs", seasonId: "2026", matches: [{ kickoff: "2026-11-21T11:00:00Z" }] },
    { compId: "mondial", seasonId: "2026", matches: [{ kickoff: "2026-11-20T12:00:00Z" }] },
  ];
  const direct = orderNationalStandings(tables, { competition_id: "mondial", season_id: "2026" }, now);
  expect(direct.tables.map((table) => table.compId)).toEqual(["mondial", "qualifs"]);
  expect(direct.matchesFeatured).toBe(true);
  expect(orderNationalStandings(tables, { competition_id: "mondial", season_id: "2024" }, now).matchesFeatured).toBe(false);
  expect(orderNationalStandings(tables, { competition_id: "amicaux", season_id: "2026" }, now).matchesFeatured).toBe(false);
  expect(orderNationalStandings(tables, { competition_id: "mondial" }, now).matchesFeatured).toBe(false);
});

it("présente le groupe lié au dernier résultat, avec repli si ce match n'a pas de classement", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  const tables = [{ compId: "qualifs", matches: [{ kickoff: "2026-11-21T11:00:00Z" }] }, { compId: "mondial", matches: [{ kickoff: "2026-11-20T12:00:00Z" }] }];
  expect(prioritizeResultCompetition(tables, "mondial", now).map((item) => item.compId)).toEqual(["mondial", "qualifs"]);
  expect(prioritizeResultCompetition(tables, "amicaux", now).map((item) => item.compId)).toEqual(["qualifs", "mondial"]);
});
