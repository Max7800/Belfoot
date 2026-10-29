import { describe, expect, it } from "vitest";
import { adminPanelIndex, adminSections } from "@/config/admin";

// Menu de l'administration rangé le 30/10/2026 (« tout est devenu brouillon »).
describe("menu de l'administration", () => {
  it("plus de section « Avancé » ni d'entrée vers une page vide", () => {
    expect(adminSections.some((section) => section.label === "Avancé")).toBe(false);
    for (const key of ["media", "seo", "io", "config", "modules", "flags", "moderation", "forum"]) expect(adminPanelIndex[key], key).toBeUndefined();
  });
  it("« Historique » enfin dans le menu ; « Préparation 2026 » renommée d'après son contenu", () => {
    expect(adminPanelIndex["sync-history"]).toMatchObject({ label: "Historique", section: "Synchronisation" });
    expect(adminPanelIndex.jobs.label).toBe("Synchronisations");
    expect(adminPanelIndex["system-status"].label).toBe("Fiabilité des données");
  });
  it("chaque entrée a une clé unique", () => {
    const keys = adminSections.flatMap((section) => section.panels.map((panel) => panel.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
