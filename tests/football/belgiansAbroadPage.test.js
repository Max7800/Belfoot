import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { resolvePlayerLeague } from "@/lib/playerSnapshot";

// Audit du 27/10/2026, page « Belges à l'étranger ».
const CPL = { id: "cpl", name: "Challenger Pro League", competition_scope: "belgique", competition_type: "league", ext: { country: "Belgium", providerType: "League" } };
const LIGA = { id: "liga", name: "La Liga", competition_scope: "etranger", competition_type: "league", ext: { country: "Spain", providerType: "League" } };

describe("championnat d'un Belge à l'étranger", () => {
  it("instantané d'un ancien club belge ignoré quand le club actuel est dans un autre pays (Bisiwu, Barcelone)", () => {
    const player = { club_id: "barca", competition: "Challenger Pro League" };
    expect(resolvePlayerLeague({ player, competitionsById: { cpl: CPL }, club: { ext: { country: "Spain" } } })).toEqual({ name: null, competition: null });
  });
  it("instantané cohérent avec le pays du club, ou pays du club inconnu : gardé", () => {
    const player = { club_id: "x", competition: "La Liga" };
    expect(resolvePlayerLeague({ player, competitionsById: { liga: LIGA }, club: { ext: { country: "spain" } } }).name).toBe("La Liga");
    expect(resolvePlayerLeague({ player, competitionsById: { liga: LIGA }, club: { ext: {} } }).name).toBe("La Liga");
    expect(resolvePlayerLeague({ player, competitionsById: { liga: LIGA } }).name).toBe("La Liga");
  });
});

describe("page Belges à l'étranger", () => {
  const page = fs.readFileSync("app/belges-a-l-etranger/page.js", "utf8");
  const map = fs.readFileSync("components/football/BelgiansWorldMap.js", "utf8");
  it("championnat non suivi : un groupe par pays, plus un seul groupe au drapeau du premier joueur", () => {
    expect(page).toContain("const key = known ? item.competition : `?${item.country}`;");
    expect(page).toContain("selectLeague(league.filter, league.unknownLeague ? league.country : null)");
  });
  it("dernières performances : matchs en club où le joueur est entré en jeu", () => {
    expect(page).toContain('Number(row.performance.minutes) > 0 && data.clubs[row.performance.club_id]?.team_type !== "national"');
  });
  it("championnat cohérent avec le club actuel", () => {
    expect(page).toContain("clubLeagues, club });");
  });
  it("coquilles corrigées", () => {
    expect(map).toContain("Clique sur une <span");
    expect(map).not.toContain("exilé(s)");
  });
});
