import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { DAYS_AHEAD, DAYS_BACK, dayStrip, dayWindow, defaultDay, localDayKey, matchesByDay } from "@/lib/liveDays";

// Page Direct (28/10/2026) : vide après minuit, matchs de la veille inaccessibles.
// Barre de jours J-5 à J+7 et jour par défaut utile.
const NOW = new Date(2026, 9, 29, 0, 52); // 29 oct., 00 h 52, heure locale
const at = (day, hour, extra = {}) => ({ id: `${day}-${hour}`, kickoff: new Date(2026, 9, day, hour, 0).toISOString(), status: "scheduled", ...extra });

describe("barre de jours", () => {
  it("J-5 à J+7 : 13 jours, « Hier », « Aujourd'hui », « Demain » au bon endroit", () => {
    const days = dayStrip(NOW);
    expect(days).toHaveLength(DAYS_BACK + DAYS_AHEAD + 1);
    expect(days[0].key).toBe("2026-10-24");
    expect(days.at(-1).key).toBe("2026-11-05");
    expect(days.filter((day) => day.offset >= -1 && day.offset <= 1).map((day) => day.label)).toEqual(["Hier", "Aujourd'hui", "Demain"]);
    expect(days.find((day) => day.offset === 0).key).toBe("2026-10-29");
  });
  it("fenêtre chargée : début de J-5 à début de J+8", () => {
    const { start, end } = dayWindow(NOW);
    expect(localDayKey(start)).toBe("2026-10-24");
    expect([start.getHours(), start.getMinutes()]).toEqual([0, 0]);
    expect(localDayKey(end)).toBe("2026-11-06");
  });
  it("matchs rangés par jour local ; date invalide écartée", () => {
    const days = matchesByDay([at(28, 21), at(28, 18), at(29, 20), { id: "x", kickoff: "pas une date" }]);
    expect(Object.keys(days).sort()).toEqual(["2026-10-28", "2026-10-29"]);
    expect(days["2026-10-28"]).toHaveLength(2);
    expect(localDayKey("pas une date")).toBeNull();
  });
});

describe("jour ouvert au chargement", () => {
  it("le direct d'abord", () => {
    expect(defaultDay([at(29, 0, { status: "live" }), at(30, 20)], NOW)).toBe("live");
  });
  it("aujourd'hui s'il y a des matchs", () => {
    expect(defaultDay([at(28, 21), at(29, 20)], NOW)).toBe("2026-10-29");
  });
  it("sinon les derniers résultats (jour passé le plus récent) : plus de page vide après minuit", () => {
    expect(defaultDay([at(26, 20), at(28, 21), at(31, 15)], NOW)).toBe("2026-10-28");
  });
  it("sinon le prochain jour de match ; rien du tout : aujourd'hui", () => {
    expect(defaultDay([at(31, 15), at(30, 20)], NOW)).toBe("2026-10-30");
    expect(defaultDay([], NOW)).toBe("2026-10-29");
  });
});

describe("composant : branchements", () => {
  const component = fs.readFileSync("components/football/LiveMatchCenter.js", "utf8");
  it("fenêtre et jour par défaut de lib/liveDays ; derniers faits pour les matchs en direct seulement", () => {
    expect(component).toContain("const { start, end } = dayWindow(new Date());");
    expect(component).toContain("defaultDay(matches, new Date())");
    expect(component).toContain("await loadEvents(nextMatches.filter(isMatchLive).map((match) => match.id));");
  });
  it("faits en temps réel : rechargement seulement pour un match affiché", () => {
    expect(component).toContain("if (loadedIds.current.has(payload.new?.match_id || payload.old?.match_id)) scheduleLoad();");
  });
  it("mise en avant : la Belgique, et les clubs de Belges suivis hors des compétitions belges", () => {
    expect(component).toContain("competitionMap[match.competition_id]?.competition_scope !== \"belgique\" && (followedClubs.has(match.home_club_id) || followedClubs.has(match.away_club_id))");
    expect(component).toContain("isBelgiumTeam(clubs[match.home_club_id]) || isBelgiumTeam(clubs[match.away_club_id])");
  });
  it("une ligne par équipe, score à droite ; compétitions sur deux colonnes en bureau", () => {
    expect(component).toContain("<TeamLine club={clubs[match.home_club_id]}");
    expect(component).toContain("grid items-start gap-4 lg:grid-cols-2");
  });
  it("titre unique sur la page", () => {
    expect(fs.readFileSync("app/direct/page.js", "utf8")).toContain("Scores en direct</h1>");
    expect(component).not.toContain("Match Center");
  });
});
