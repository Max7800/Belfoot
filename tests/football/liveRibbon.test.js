import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { homeDefaultDay, ribbonViewLabel } from "@/lib/liveDays";

// Bloc « Scores en direct » de l'accueil, refait le 30/10/2026 sur le modèle de /direct.
const NOW = new Date(2026, 9, 30, 9, 0); // vendredi 30 octobre, heure locale

describe("titre de la vue", () => {
  it("direct, aujourd'hui, hier (résultats), demain (programme)", () => {
    expect(ribbonViewLabel("live", NOW)).toBe("En direct");
    expect(ribbonViewLabel("2026-10-30", NOW)).toBe("Aujourd'hui");
    expect(ribbonViewLabel("2026-10-29", NOW)).toBe("Hier · résultats");
    expect(ribbonViewLabel("2026-10-31", NOW)).toBe("Demain · programme");
  });
  it("autre jour : date en toutes lettres, résultats avant aujourd'hui, programme après", () => {
    expect(ribbonViewLabel("2026-10-27", NOW)).toMatch(/^Mardi 27 octobre · résultats$/);
    expect(ribbonViewLabel("2026-11-03", NOW)).toMatch(/^Mardi 3 novembre · programme$/);
  });
});

describe("vue par défaut de l'accueil", () => {
  const at = (day, hour, extra = {}) => ({ id: `${day}-${hour}`, kickoff: new Date(2026, 9, day, hour).toISOString(), status: "scheduled", ...extra });
  it("direct, puis aujourd'hui, puis hier", () => {
    expect(homeDefaultDay([at(30, 8, { status: "live" }), at(31, 20)], NOW)).toBe("live");
    expect(homeDefaultDay([at(29, 20), at(30, 20)], NOW)).toBe("2026-10-30");
    expect(homeDefaultDay([at(27, 20), at(29, 20), at(31, 20)], NOW)).toBe("2026-10-29");
  });
  it("sinon le prochain jour de match plutôt que des résultats de l'avant-veille (cas du 30/10)", () => {
    expect(homeDefaultDay([at(28, 20), at(31, 18), at(31, 20), at(1, 15)], NOW)).toBe("2026-10-31");
  });
  it("rien à venir : les derniers résultats ; rien du tout : aujourd'hui", () => {
    expect(homeDefaultDay([at(27, 20), at(28, 20)], NOW)).toBe("2026-10-28");
    expect(homeDefaultDay([], NOW)).toBe("2026-10-30");
  });
});

describe("accueil : branchements", () => {
  const ribbon = fs.readFileSync("components/football/LiveScoreRibbon.js", "utf8");
  it("même vue par défaut que /direct, sur J-2 à J+7", () => {
    expect(ribbon).toContain("const view = loading ? null : homeDefaultDay(matches, new Date());");
    expect(ribbon).toContain("dayWindow(new Date(), DAYS_BACK, DAYS_AHEAD)");
  });
  it("lignes de score partagées (issue colorée, V / N / D), plus de carte vedette", () => {
    expect(ribbon).toContain("<ScoreRow key={match.id} match={match} clubs={clubs} competition={competitionMap[match.competition_id]}");
    expect(ribbon).not.toContain("FeaturedScore");
    expect(ribbon).not.toContain("CompactScore");
  });
  it("faits en temps réel : rechargement seulement pour un match affiché", () => {
    expect(ribbon).toContain("if (loadedIds.current.has(payload.new?.match_id || payload.old?.match_id)) scheduleReload();");
  });
});
