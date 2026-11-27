import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CompetitionWinners from "@/components/football/CompetitionWinners";

describe("affichage du palmarès", () => {
  it("ne montre rien sans données et masque les sources dangereuses", () => {
    expect(renderToStaticMarkup(React.createElement(CompetitionWinners, { history: [] }))).toBe("");
    const html = renderToStaticMarkup(React.createElement(CompetitionWinners, { history: [{ season: "2025-2026", winner: "Club", source: "javascript:alert(1)" }] }));
    expect(html).toBe("");
  });
  it("présente les cinq dernières saisons et permet d'ouvrir les autres", () => {
    const history = [2020, 2021, 2022, 2023, 2024, 2025].map((year) => ({ season: String(year), winner: `Club ${year}`, source: "https://example.org" }));
    const html = renderToStaticMarkup(React.createElement(CompetitionWinners, { history }));
    expect(html).toContain("Derniers vainqueurs");
    expect(html.indexOf("Club 2025")).toBeLessThan(html.indexOf("Club 2024"));
    expect(html).toContain("Voir les saisons précédentes (1)");
    expect(html).toContain("rel=\"noopener noreferrer\"");
  });
  it("relie une équipe identifiée à sa fiche, sans lien inventé pour un nom libre", () => {
    const html = renderToStaticMarkup(React.createElement(CompetitionWinners, { history: [{ season: "2025", winner: "Club A", club_id: "f012418d-b844-431b-82b6-aafce85b2ef0" }, { season: "2024", winner: "Club B" }] }));
    expect(html).toContain('href="/clubs/f012418d-b844-431b-82b6-aafce85b2ef0"');
    expect(html).not.toContain("/clubs/undefined");
  });
});
