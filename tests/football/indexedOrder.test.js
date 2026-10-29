import fs from "node:fs";
import { describe, expect, it } from "vitest";

// 30/10/2026 : trié par id seul, une tranche qui ne trouvait presque rien faisait
// parcourir toute la table (1,7 s au lieu de 0,2 s ; 3,5 s par tranche sur la page
// d'une compétition). Tri par la colonne filtrée d'abord, matchs à venir écartés.
describe("lectures volumineuses : tri par la colonne filtrée", () => {
  const data = fs.readFileSync("lib/publicFootballData.js", "utf8");
  it("performances par match, statistiques et affectations par joueur", () => {
    expect(data).toContain('.in("match_id", ids).order("match_id")');
    expect(data).toContain('db.from("player_season_stats").select(PUBLIC_PLAYER_STATS_FIELDS).in("player_id", ids).order("player_id")');
    expect(data).toMatch(/from\("player_team_seasons"\)[^\n]*\.in\("player_id", ids\)\.order\("player_id"\)/);
  });
  it("page d'une compétition : matchs joués seulement, effectifs triés par club", () => {
    const page = fs.readFileSync("app/competitions/[slug]/page.js", "utf8");
    expect(page).toContain('seasonMatches.filter((match) => ["finished", "live"].includes(match.status)).map((match) => match.id)');
    expect(page).toContain('.in("club_id", clubIds)\n        .order("club_id"))'.replace(/\n/g, page.includes("\r\n") ? "\r\n" : "\n"));
  });
});

describe("page d'une compétition : un seul chargement de la saison", () => {
  it("compétition posée après ses saisons (posée avant, un premier chargement complet sans saison partait pour rien)", () => {
    const page = fs.readFileSync("app/competitions/[slug]/page.js", "utf8").replace(/\r\n/g, "\n");
    const seasonsAt = page.indexOf("setSeasons(orderedSeasons); setSeasonLabel(orderedSeasons[0]?.label || \"\");");
    const compAt = page.indexOf("    setComp(c);\n", seasonsAt);
    expect(seasonsAt).toBeGreaterThan(0);
    expect(compAt).toBeGreaterThan(seasonsAt);
    expect(page.slice(page.indexOf("const c = resolveCompetitionRoute(competitionRows || [], slug);"), seasonsAt)).not.toContain("setComp(c);");
  });
});
