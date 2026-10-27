import { describe, expect, it } from "vitest";
import { detectNewCampaign, planWithCampaign, rolloverScope } from "@/lib/campaignRollover";
import { hydrateCompetitionConfig } from "@/lib/importPlan";

// Constat du 27/10/2026 : l'API garde la dernière édition « en cours » entre deux
// éditions ; la surveillance importait les qualifications de l'Euro 2024.
const NOW = Date.parse("2026-10-27T12:00:00Z");
const EURO_QUALIF = { id: "c-960", name: "Euro Championship - Qualification", ext: {} };
const league = (season) => ({ seasons: [{ year: 2021, end: "2022-03-29", current: false }, { current: true, ...season }] });

describe("campagne terminée : en attente de la suivante", () => {
  it("fin passée : pas d'import, raison lisible", () => {
    expect(detectNewCampaign({ competition: EURO_QUALIF, league: league({ year: 2023, start: "2023-03-23", end: "2024-03-26" }), now: NOW }))
      .toEqual({ skip: "campagne 2023-2024 terminée le 2024-03-26, en attente de la suivante", label: "2023-2024", ended: true });
  });
  it("fin le jour même (heure UTC) ou à venir, ou inconnue : importée", () => {
    expect(detectNewCampaign({ competition: EURO_QUALIF, league: league({ year: 2027, start: "2027-03-25", end: "2028-03-28" }), now: NOW })).toEqual({ label: "2027-2028", year: "2027" });
    expect(detectNewCampaign({ competition: EURO_QUALIF, league: league({ year: 2026, end: "2026-10-27" }), now: NOW })).toEqual({ label: "2026-2027", year: "2026" });
    expect(detectNewCampaign({ competition: EURO_QUALIF, league: league({ year: 2026, end: null }), now: NOW })).toEqual({ label: "2026-2027", year: "2026" });
  });
  it("déjà importée : reste « à jour » ; importée vide mais terminée : plus de nouvel essai", () => {
    const imported = { ...EURO_QUALIF, ext: { full_competition_seasons: { "2023-2024": true } } };
    const past = league({ year: 2023, end: "2024-03-26" });
    expect(detectNewCampaign({ competition: imported, league: past, importedMatches: 239, now: NOW })).toMatchObject({ upToDate: true });
    expect(detectNewCampaign({ competition: imported, league: past, importedMatches: 0, now: NOW })).toMatchObject({ ended: true });
    expect(detectNewCampaign({ competition: imported, league: league({ year: 2023, end: "2027-01-01" }), importedMatches: 0, now: NOW })).toMatchObject({ refill: true });
  });
});

describe("niveau d'import choisi pour la surveillance", () => {
  const plan = (config) => ({ version: 4, seasons: [{ label: "2027-2028", role: "added", enabled: true }], competitions: { "c-960": { enabled: true, watch: true, ...config } } });
  it("Saison complète pour une grande compétition ; Archive résultats par défaut ou si valeur inconnue", () => {
    expect(planWithCampaign(plan({ watch_scope: "complete" }), "2027-2028", "c-960").plan.competitions["c-960"].seasons["2027-2028"].scope).toBe("complete");
    expect(planWithCampaign(plan({}), "2027-2028", "c-960").plan.competitions["c-960"].seasons["2027-2028"].scope).toBe("base");
    expect(rolloverScope({ watch_scope: "n'importe quoi" })).toBe("base");
  });
  it("une saison déjà autorisée garde son niveau", () => {
    const configured = plan({ watch_scope: "complete", seasons: { "2027-2028": { enabled: true, scope: "squads" } } });
    expect(planWithCampaign(configured, "2027-2028", "c-960").plan.competitions["c-960"].seasons["2027-2028"].scope).toBe("squads");
  });
  it("réglage conservé à l'ouverture du plan d'import (valeur connue, hors défaut)", () => {
    const competition = { id: "c-960", name: "Euro Championship - Qualification", external_id: "960", competition_scope: "international" };
    expect(hydrateCompetitionConfig(competition, { enabled: true, watch: true, watch_scope: "complete" }).watch_scope).toBe("complete");
    expect(hydrateCompetitionConfig(competition, { enabled: true, watch: true, watch_scope: "base" }).watch_scope).toBeUndefined();
    expect(hydrateCompetitionConfig(competition, { enabled: true, watch: true, watch_scope: "tout" }).watch_scope).toBeUndefined();
  });
});
