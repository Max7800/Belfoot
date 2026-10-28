import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SHARE_TONES, groupStatsBySeason, shareTone } from "@/lib/playerSeasons";

// Fiche joueur jugée « fort chargée » le 28/10/2026 : saisons dépliables,
// listes limitées à 3, couleurs des anneaux selon le niveau.
const stats = [
  { id: "pl", competition_id: "pro", club_id: "rsca", season: "2025", appearances: 30, lineups: 28, minutes: 2500, goals: 0, assists: 1, yellow: 4, red: 0, rating: 7.0 },
  { id: "el", competition_id: "uel", club_id: "rsca", season: "2025", appearances: 8, lineups: 8, minutes: 720, goals: 0, assists: 0, yellow: 1, red: 1, rating: 7.4 },
  { id: "nl", competition_id: "unl", club_id: "bel", season: "2026", appearances: 2, lineups: 2, minutes: 173, goals: 1, assists: 0, rating: 7.4 },
  { id: "pl26", competition_id: "pro", club_id: "rsca", season: "2026-2027", appearances: 17, lineups: 17, minutes: 1530, goals: 0, assists: 0, rating: 7.4 },
  { id: "x", competition_id: "pro", club_id: "rsca", season: null, appearances: 3 },
];

describe("statistiques par saison", () => {
  it("une saison par année de début (Nations League « 2026 » avec 2026-2027), plus récente d'abord", () => {
    const seasons = groupStatsBySeason(stats);
    expect(seasons.map((season) => season.label)).toEqual(["2026-2027", "2025-2026"]);
    expect(seasons[0].rows.map((row) => row.id)).toEqual(["pl26", "nl"]); // le plus de matchs d'abord
  });
  it("totaux additionnés, note pondérée par les matchs, cartons comptés ; ligne sans saison écartée", () => {
    const [, season2025] = groupStatsBySeason(stats);
    expect(season2025.totals).toEqual({ appearances: 38, lineups: 36, minutes: 3220, goals: 0, assists: 1, yellow: 5, red: 1, rating: (30 * 7.0 + 8 * 7.4) / 38 });
    expect(groupStatsBySeason([{ season: "2024", appearances: 2, rating: 0 }])[0].totals.rating).toBeNull();
    expect(groupStatsBySeason([])).toEqual([]);
    expect(groupStatsBySeason([{ season: "2024", appearances: 0, minutes: 0 }, { season: "2025", appearances: 0, minutes: 946 }]).map((season) => season.year)).toEqual([2025]); // vide : écartée
  });
});

describe("couleur des anneaux selon le niveau", () => {
  it("seuils propres à chaque mesure : passes 85/75, duels 55/45, dribbles 60/45, tirs cadrés 50/35", () => {
    expect([85, 80, 60].map((value) => shareTone("passes", value))).toEqual([SHARE_TONES.good, SHARE_TONES.fair, SHARE_TONES.low]);
    expect([55, 50, 40].map((value) => shareTone("duels", value))).toEqual([SHARE_TONES.good, SHARE_TONES.fair, SHARE_TONES.low]);
    expect([60, 45, 44].map((value) => shareTone("dribbles", value))).toEqual([SHARE_TONES.good, SHARE_TONES.fair, SHARE_TONES.low]);
    expect([50, 35, 34].map((value) => shareTone("shots", value))).toEqual([SHARE_TONES.good, SHARE_TONES.fair, SHARE_TONES.low]);
    expect(shareTone("passes", null)).toBe(SHARE_TONES.none);
  });
});

describe("fiche joueur : branchements", () => {
  const page = fs.readFileSync("app/players/[id]/page.js", "utf8");
  const widget = fs.readFileSync("components/football/PlayerStatsWidget.js", "utf8");
  it("saisons dépliables, la plus récente ouverte", () => {
    expect(page).toContain("const seasons = useMemo(() => groupStatsBySeason(stats), [stats]);");
    expect(page).toContain("const open = openYears || new Set(seasons[0] ? [seasons[0].year] : []);");
    expect(page).toContain("<SeasonStats stats={state.stats}");
  });
  it("dernières performances et saisons d'un club : 3, puis « voir plus »", () => {
    expect(page).toContain("const VISIBLE_LINES = 3;");
    expect(page).toContain("view.performanceRows.slice(0, showAllPerformances ? undefined : VISIBLE_LINES)");
  });
  it("anneaux du widget colorés selon le niveau", () => {
    for (const metric of ["shots", "passes", "duels", "dribbles"]) expect(widget).toContain(`ringTone={shareTone("${metric}",`);
  });
});
