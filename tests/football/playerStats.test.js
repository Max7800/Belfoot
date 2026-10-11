import { describe, expect, it } from "vitest";
import { preferAssignedPlayerStats } from "@/lib/playerStats";
import { resolvePlayerCountry, resolvePlayerLeague } from "@/lib/playerSnapshot";

// Lignes réelles de J. Mokio en production (11/10/2026), identifiants abrégés.
// La 3e est orpheline : sa compétition (doublon Conference League) a été
// supprimée, competition_id et season_id sont passés à null.
const MOKIO = [
  { id: "ere", player_id: "mokio", season: "2026", club_id: "ajax", competition_id: "c-ere", appearances: 7, lineups: 5, minutes: 433, goals: 1, assists: 0, yellow: 1, red: 0, rating: 6.71 },
  { id: "uecl", player_id: "mokio", season: "2026", club_id: "ajax", competition_id: "c-uecl", appearances: 6, lineups: 1, minutes: 295, goals: 0, assists: 1, yellow: 2, red: 0, rating: 6.67 },
  { id: "orphan", player_id: "mokio", season: "2026", club_id: "ajax", competition_id: null, appearances: 6, lineups: 1, minutes: 295, goals: 0, assists: 1, yellow: 2, red: 0, rating: 6.67 },
  { id: "jpl", player_id: "mokio", season: "2024", club_id: "gent", competition_id: "c-jpl", appearances: 0, lineups: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, rating: null },
];
const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

describe("preferAssignedPlayerStats — lignes orphelines", () => {
  it("Mokio : l'orpheline jumelle de la Conference League n'est plus comptée (13 matchs, pas 19)", () => {
    const rows = preferAssignedPlayerStats(MOKIO);
    expect(rows.map((row) => row.id).sort()).toEqual(["ere", "jpl", "uecl"]);
    const season2026 = rows.filter((row) => row.season === "2026");
    expect(sum(season2026, "appearances")).toBe(13);
    expect(sum(season2026, "minutes")).toBe(728);
  });

  it("une orpheline sans jumelle reste visible et comptée", () => {
    const lone = { id: "lone", player_id: "p", season: "2026", club_id: "ajax", competition_id: null, appearances: 4, minutes: 120 };
    expect(preferAssignedPlayerStats([lone]).map((row) => row.id)).toEqual(["lone"]);
  });

  it("des chiffres différents, un autre club ou une autre saison ne sont pas un doublon", () => {
    const base = { player_id: "p", season: "2026", club_id: "ajax", competition_id: "c-1", appearances: 6, minutes: 295 };
    const rows = [
      { id: "attr", ...base },
      { id: "diff", ...base, competition_id: null, minutes: 300 },
      { id: "club", ...base, competition_id: null, club_id: "psv" },
      { id: "season", ...base, competition_id: null, season: "2025" },
    ];
    expect(preferAssignedPlayerStats(rows).map((row) => row.id).sort()).toEqual(["attr", "club", "diff", "season"]);
  });

  it("règle historique conservée : une ligne avec club prime sur la ligne legacy sans club", () => {
    const rows = [
      { id: "with-club", player_id: "p", season: "2026", club_id: "ajax", competition_id: "c-1", appearances: 21 },
      { id: "legacy", player_id: "p", season: "2026", club_id: null, competition_id: "c-1", appearances: 18 },
    ];
    expect(preferAssignedPlayerStats(rows).map((row) => row.id)).toEqual(["with-club"]);
  });
});

describe("fiche joueur — pays de l'en-tête", () => {
  const COMPETITIONS = {
    "c-ere": { id: "c-ere", name: "Eredivisie", competition_scope: "etranger", competition_type: "league", ext: { country: "Netherlands" } },
    "c-uecl": { id: "c-uecl", name: "Conférence League", competition_scope: "europe", competition_type: "hybrid", ext: { country: "World", providerType: "Cup" } },
  };
  const player = { club_id: "ajax", country: "World", competition: "Conférence League" };

  it("« World » remplacé par le pays du club actuel", () => {
    const league = resolvePlayerLeague({ player, statRows: MOKIO, competitionsById: COMPETITIONS });
    expect(resolvePlayerCountry({ player, club: { id: "ajax", ext: { country: "Netherlands" } }, league: league.competition })).toBe("Netherlands");
  });

  it("sans pays de club : pays du championnat national de ses statistiques", () => {
    const league = resolvePlayerLeague({ player, statRows: MOKIO, competitionsById: COMPETITIONS });
    expect(league.name).toBe("Eredivisie");
    expect(resolvePlayerCountry({ player, club: { id: "ajax", ext: {} }, league: league.competition })).toBe("Netherlands");
  });

  it("aucune source fiable : rien n'est affiché plutôt que « World »", () => {
    expect(resolvePlayerCountry({ player, club: { id: "ajax", ext: {} }, league: null })).toBeNull();
  });
});
