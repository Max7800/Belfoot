import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { competitionTabs, displaySeason, matchDetails, share } from "@/lib/playerSeasonWidget";

// Cas réel De Bruyne (27/10/2026) : Ligue des champions 3 matchs à 7,1 (note de
// saison de l'API), mais une seule performance détaillée notée 6,1.
const stat = (competition_id, extra = {}) => ({ competition_id, club_id: "napoli", season: "2026", appearances: 0, lineups: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, rating: null, ...extra });
const perf = (statistics) => ({ match_id: "m", ext: { statistics: [statistics] } });

describe("onglets de compétitions", () => {
  it("une par compétition, la plus jouée d'abord ; totaux additionnés ; note pondérée par les matchs", () => {
    const tabs = competitionTabs([
      stat("nl", { club_id: "belgique", appearances: 2, lineups: 2, minutes: 121, assists: 1, yellow: 1, rating: 6.9 }),
      stat("ucl", { appearances: 3, lineups: 3, minutes: 270, assists: 1, yellow: 1, rating: 7.1 }),
      stat("ucl", { club_id: "city", season: "2026", appearances: 1, minutes: 30, goals: 1, rating: 8.1 }),
      stat(null, { appearances: 9 }),
    ]);
    expect(tabs.map((tab) => tab.competitionId)).toEqual(["ucl", "nl"]);
    expect(tabs[0]).toMatchObject({ appearances: 4, lineups: 3, minutes: 300, goals: 1, assists: 1, yellow: 1, red: 0, clubIds: ["napoli", "city"], seasons: ["2026"] });
    expect(tabs[0].rating).toBeCloseTo((7.1 * 3 + 8.1) / 4, 5);
  });
  it("sans note : null (jamais 0) ; aucune statistique : aucun onglet", () => {
    expect(competitionTabs([stat("x", { appearances: 2 })])[0].rating).toBeNull();
    expect(competitionTabs([])).toEqual([]);
  });
});

describe("détail des matchs", () => {
  it("additionne tirs, passes (accuracy = passes réussies), duels, dribbles, défense, fautes, gardien", () => {
    const details = matchDetails([
      perf({ shots: { total: 1, on: 1 }, passes: { total: 29, key: 2, accuracy: "20" }, duels: { total: 7, won: 4 }, dribbles: { attempts: 0, success: 0 }, tackles: { total: 1, blocks: 0, interceptions: 0 }, fouls: { drawn: 3, committed: 1 }, goals: { saves: 0, conceded: null }, penalty: { scored: 0, missed: null } }),
      perf({ shots: { total: 3, on: null }, passes: { total: 41, key: 1, accuracy: "35" }, duels: { total: 5, won: 1 }, dribbles: { attempts: 2, success: 1 }, tackles: { total: 2, interceptions: 1 }, fouls: { drawn: 0, committed: 2 }, penalty: { scored: 1 } }),
      { match_id: "sans-detail", ext: {} },
    ]);
    expect(details).toEqual({
      matches: 2,
      shots: { total: 4, on: 1 }, passes: { total: 70, accurate: 55, key: 3 }, duels: { total: 12, won: 5 },
      dribbles: { attempts: 2, success: 1 }, defence: { tackles: 3, interceptions: 1, blocks: 0 },
      fouls: { drawn: 3, committed: 3 }, goalkeeper: { saves: 0, conceded: 0 }, penalties: { scored: 1, missed: 0 },
    });
    expect(matchDetails([{ ext: {} }])).toBeNull();
    expect(matchDetails()).toBeNull();
  });
  it("pourcentages arrondis ; rien à mesurer : null", () => {
    expect([share(55, 70), share(1, 3), share(0, 0), share(3, null)]).toEqual([79, 33, null, null]);
  });
});

describe("fiche joueur", () => {
  const page = fs.readFileSync("app/players/[id]/page.js", "utf8");
  it("note d'en-tête : note de saison de l'API d'abord, moyenne des matchs détaillés en repli", () => {
    expect(page).toContain("rating: fallbackRating ?? (performanceRatings.length ?");
  });
  it("libellé de saison « 2026-2027 », plus « Saison 2026 »", () => {
    expect(page).toContain("Saison {view.seasonLabel || \"en cours\"}");
    expect(page).not.toContain("Saison {view.latestSeason");
  });
});

describe("saison affichée", () => {
  it("clubs : « 2026-2027 » ; sélections : année civile ; libellé déjà complet inchangé", () => {
    expect(displaySeason("2026", { competition_scope: "europe" })).toBe("2026-2027");
    expect(displaySeason("2026", { competition_scope: "belgique" })).toBe("2026-2027");
    expect(displaySeason("2026", undefined)).toBe("2026-2027");
    expect(displaySeason("2026", { competition_scope: "international" })).toBe("2026");
    expect(displaySeason("2025-2026", { competition_scope: "belgique" })).toBe("2025-2026");
    expect(displaySeason(null)).toBe("");
  });
});
