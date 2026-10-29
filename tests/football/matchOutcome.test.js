import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { matchOutcome, sideResult } from "@/lib/matchOutcome";

// Repères de la page Direct (29/10/2026) : vainqueur, nul, défaite lisibles d'un coup d'œil.
const match = (home_score, away_score, status = "finished") => ({ home_score, away_score, status });

describe("issue d'un match", () => {
  it("vainqueur et perdant ; nul ; rien tant que le match n'est pas terminé ou sans score", () => {
    expect(matchOutcome(match(3, 0))).toEqual({ home: "win", away: "loss" });
    expect(matchOutcome(match(0, 2))).toEqual({ home: "loss", away: "win" });
    expect(matchOutcome(match(2, 2))).toEqual({ home: "draw", away: "draw" });
    expect(matchOutcome(match(1, 0, "live"))).toEqual({ home: null, away: null });
    expect(matchOutcome(match(null, null))).toEqual({ home: null, away: null });
    expect(matchOutcome({ home_score: 1, away_score: 0, status: "scheduled", ext: { status_short: "FT" } })).toEqual({ home: "win", away: "loss" }); // statut fournisseur
  });
  it("pastille V / N / D du camp suivi", () => {
    expect(sideResult(match(3, 0), "home")).toEqual({ outcome: "win", letter: "V" });
    expect(sideResult(match(3, 0), "away")).toEqual({ outcome: "loss", letter: "D" });
    expect(sideResult(match(1, 1), "away")).toEqual({ outcome: "draw", letter: "N" });
    expect(sideResult(match(1, 0, "live"), "home")).toBeNull();
  });
});

describe("page Direct : repères", () => {
  // Ligne de score partagée avec l'accueil depuis le 30/10 (components/football/ScoreLine.js).
  const component = fs.readFileSync("components/football/LiveMatchCenter.js", "utf8") + fs.readFileSync("components/football/ScoreLine.js", "utf8");
  it("scores colorés par issue (vert vainqueur, ambre nul), perdant en retrait", () => {
    expect(component).toContain("const SCORE_TONE = { win: \"bg-emerald-400/15 text-emerald-200\", draw: \"bg-amber-300/15 text-amber-200\", loss: \"text-muted\" };");
    expect(component).toContain("outcome={outcome.home}");
    expect(component).toContain("outcome={outcome.away}");
  });
  it("pastille V / N / D du camp belge suivi", () => {
    expect(component).toContain("const result = followedSide ? sideResult(match, followedSide) : null;");
    expect(component).toContain("followedSide={followedSide(match)}");
  });
  it("« Aujourd'hui » repérable même non choisi, jamais grisé", () => {
    expect(component).toContain("const today = day.offset === 0;");
    expect(component).toContain("${count || today ? \"\" : \"opacity-45\"}");
  });
});
