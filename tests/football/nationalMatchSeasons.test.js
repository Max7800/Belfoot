import { describe, expect, it } from "vitest";
import { providerSeasonYear, resolveNationalMatchSeason } from "@/modules/football/nationalMatchSeasons";
import { seasonLabel } from "@/modules/football/season";

describe("providerSeasonYear", () => {
  it("accepte une année à quatre chiffres, nombre ou texte", () => {
    expect(providerSeasonYear(2024)).toBe(2024);
    expect(providerSeasonYear("2026")).toBe(2026);
    expect(providerSeasonYear(" 2026 ")).toBe(2026);
  });

  it("refuse les valeurs absentes ou ambiguës", () => {
    for (const value of [null, undefined, "", "   ", "abc", 24, "24", "2024-2025", "2024/2025", 2024.5, Number.NaN, true, {}, []]) {
      expect(providerSeasonYear(value)).toBeNull();
    }
  });

  it("refuse les années illisibles hors 1900–2100", () => {
    expect(providerSeasonYear(1899)).toBeNull();
    expect(providerSeasonYear(2101)).toBeNull();
    expect(providerSeasonYear("0000")).toBeNull();
  });
});

describe("resolveNationalMatchSeason", () => {
  const at = (league_season, kickoff) => resolveNationalMatchSeason({ league_season, kickoff });

  it("Nations League 2024-25 : groupes puis finale l'année suivante", () => {
    expect(at(2024, "2024-09-07T18:45:00+00:00")).toMatchObject({ label: "2024-2025", unusual: false });
    expect(at(2024, "2025-06-08T19:00:00+00:00")).toMatchObject({ label: "2024-2025", unusual: false });
  });

  it("amical rangé par année civile", () => {
    expect(at(2026, "2026-03-27T19:45:00+00:00")).toMatchObject({ label: "2026-2027", unusual: false });
    expect(at(2026, "2026-11-14T19:45:00+00:00")).toMatchObject({ label: "2026-2027", unusual: false });
  });

  it("qualifications rangées sous l'année du tournoi (écart −1 à −3) : acceptées sans avertissement", () => {
    expect(at(2026, "2025-03-21T19:45:00+00:00")).toMatchObject({ label: "2026-2027", gap: -1, unusual: false });
    expect(at(2027, "2025-09-05T16:00:00+00:00")).toMatchObject({ label: "2027-2028", gap: -2, unusual: false });
    expect(at(2026, "2023-09-07T23:00:00+00:00")).toMatchObject({ label: "2026-2027", gap: -3, unusual: false });
  });

  it("écart inhabituel : la saison API est CONSERVÉE et seulement signalée", () => {
    expect(at(2019, "2026-03-12T19:45:00+00:00")).toMatchObject({ label: "2019-2020", unusual: true });
    expect(at(2030, "2026-03-12T19:45:00+00:00")).toMatchObject({ label: "2030-2031", unusual: true });
    expect(at(2024, "2026-06-01T19:45:00+00:00")).toMatchObject({ label: "2024-2025", gap: 2, unusual: true });
  });

  it("sans date de match exploitable : saison API acceptée, sans contrôle", () => {
    expect(at(2024, null)).toMatchObject({ label: "2024-2025", gap: null, unusual: false });
    expect(at(2024, "pas une date")).toMatchObject({ label: "2024-2025", gap: null, unusual: false });
  });

  it("saison absente ou ambiguë : aucune saison, jamais l'année courante", () => {
    for (const value of [null, undefined, "", "2024-2025", "abc"]) {
      expect(at(value, "2026-03-27T19:45:00+00:00")).toEqual({ label: null, year: null, gap: null, unusual: false });
    }
  });

  it("produit le même libellé que la convention de football.sync", () => {
    for (const year of [2024, 2025, 2026]) expect(at(year, null).label).toBe(seasonLabel(String(year)));
  });
});
