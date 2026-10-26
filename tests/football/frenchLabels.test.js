import { describe, expect, it } from "vitest";
import { frenchTeamName } from "@/lib/frenchNations";
import { positionLabel } from "@/lib/positions";
import { phaseLabel } from "@/lib/phaseLabels";
import { transferTypeLabel } from "@/lib/transferLabels";
import { legendZones } from "@/lib/standingsZones";
import { nationalTeamPagePath } from "@/lib/nationalCategories";
import { careerStints } from "@/lib/playerCareer";
import { storedClubName, upsertExternal } from "@/modules/football/sync";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Libellés anglais relevés par l'audit visiteur du 26/10/2026.
describe("sélections nommées en français", () => {
  it("pays et catégorie d'âge ; clubs, féminines « W » et inconnus inchangés", () => {
    expect(frenchTeamName("Spain U21")).toBe("Espagne U21");
    expect(frenchTeamName("Belgium")).toBe("Belgique");
    expect(frenchTeamName("Türkiye")).toBe("Turquie");
    expect(frenchTeamName("Bosnia-Herzegovina U19")).toBe("Bosnie-Herzégovine U19");
    expect(frenchTeamName(" Italy ")).toBe("Italie");
    expect(frenchTeamName("Belgium W")).toBe("Belgium W");
    expect(frenchTeamName("Paris Saint Germain")).toBe("Paris Saint Germain");
    expect(frenchTeamName("Belgique U17")).toBe("Belgique U17");
    expect(frenchTeamName(null)).toBeNull();
  });
  it("graphies du catalogue éditorial (recherche ilike de la fiche joueur)", () => {
    expect(frenchTeamName("Ivory Coast")).toBe("Côte d’Ivoire");
    expect(frenchTeamName("Nigeria")).toBe("Nigeria");
  });
  it("écriture : nom français pour la table clubs seulement, création comme mise à jour", async () => {
    const db = createFakeSupabase({ clubs: [{ id: "c1", source: "p", external_id: "10", name: "Spain U21", locked: false, ext: {} }] });
    await upsertExternal(db, "clubs", "p", [{ external_id: "10", name: "Spain U21" }, { external_id: "11", name: "England" }, { external_id: "12", name: "Ajax" }], ["name"]);
    expect(Object.fromEntries(db.rows("clubs").map((row) => [row.external_id, row.name]))).toEqual({ 10: "Espagne U21", 11: "Angleterre", 12: "Ajax" });
    expect(storedClubName("players", "England")).toBe("England");
    expect(storedClubName("clubs", undefined)).toBeUndefined();
  });
});

describe("libellés d'affichage", () => {
  it("postes", () => {
    expect(["Goalkeeper", "Defender", "Midfielder", "Attacker", "FWD", " midfielder "].map(positionLabel)).toEqual(["Gardien", "Défenseur", "Milieu", "Attaquant", "Attaquant", "Milieu"]);
    expect(positionLabel("Milieu")).toBe("Milieu");
    expect(positionLabel(null)).toBeNull();
  });
  it("phases : tous les noms présents en base le 26/10 sont traduits", () => {
    const expected = {
      "Regular Season": "Saison régulière", "Group Stage": "Phase de groupes", "League Stage": "Phase de ligue", "Friendlies": "Matchs amicaux",
      "2nd Qualifying Round": "2e tour de qualification", "1st Qualifying Round": "1er tour de qualification", "Qualifying Round": "Tour de qualification",
      "League B": "Ligue B", "1st Round": "1er tour", "Elite Round": "Tour Élite", "Play-offs": "Barrages", "Playoff round": "Barrages",
      "Ranking of second-placed teams": "Classement des deuxièmes", "Qualification - Round 1 - League A": "Qualifications · 1er tour · Ligue A",
      "Round of 32": "16es de finale", "Round of 16": "8es de finale", "Round of 64": "32es de finale", "Quarter-finals": "Quarts de finale",
      "Semi-finals": "Demi-finales", "Final": "Finale", "3rd Place Final": "Match pour la 3e place", "Group E": "Groupe E",
      "Championship Round": "Play-offs du titre", "Relegation Group": "Play-downs", "Play-offs A/B": "Barrages A/B",
      "Promotion Play-offs - Semi-finals": "Barrages de promotion · demi-finales", "Conference League Play-offs - Final": "Barrage Conference League · finale",
      "Friendly International Women": "Amicaux internationaux féminins", "Friendlies 2": "Matchs amicaux 2", "Non-FIFA Friendlies": "Matchs amicaux (hors FIFA)",
      "Round 2 - League A": "2e tour · Ligue A", "Conference League Group": "Groupe Conference League",
    };
    expect(Object.fromEntries(Object.keys(expected).map((phase) => [phase, phaseLabel(phase)]))).toEqual(expected);
    expect(phaseLabel("Journée 3")).toBe("Journée 3");
    expect(phaseLabel(null)).toBeNull();
  });
  it("types de transfert : mots traduits, montant gardé, N/A masqué", () => {
    expect(["Loan", "Free agent", "Free", "Transfer", "Back from Loan", "€ 20.5M", "N/A", "", null].map(transferTypeLabel)).toEqual(["Prêt", "Libre", "Libre", "Transfert", "Retour de prêt", "€ 20.5M", null, null, null]);
  });
  it("légende du classement : un seul « Relégable »", () => {
    const zones = [{ from: 1, to: 1, label: "Ligue des champions", color: "#1" }, { from: 15, to: 15, label: "Relégable", color: "#f80" }, { from: 16, to: 16, label: "relégable ", color: "#f00" }];
    expect(legendZones(zones).map((zone) => zone.color)).toEqual(["#1", "#f80"]);
  });
  it("parcours : saison isolée « 2026-2027 », plusieurs saisons « 2015 — 2025 »", () => {
    const stints = careerStints([{ club_id: "a", season: "2026", season_start_year: 2026 }, { club_id: "b", season_start_year: 2015 }, { club_id: "b", season_start_year: 2024 }], "a");
    expect(stints.map((stint) => stint.range)).toEqual(["2026-2027", "2015 — 2025"]);
    expect(careerStints([{ club_id: "c", season: "Saison inconnue" }])[0].range).toBe("Saison inconnue");
  });
});

describe("fiche « club » d'une sélection belge", () => {
  it("renvoie vers la page Diables ; autre sélection, féminine de jeunes ou club : non", () => {
    expect(nationalTeamPagePath({ team_type: "national", name: "Belgium", national_category: "senior" })).toBe("/diables-rouges");
    expect(nationalTeamPagePath({ team_type: "national", name: "Belgique U21" })).toBe("/diables-rouges");
    expect(nationalTeamPagePath({ team_type: "national", name: "France" })).toBeNull();
    expect(nationalTeamPagePath({ team_type: "national", name: "Belgium W U19", national_gender: "women", national_category: "u19" })).toBeNull();
    expect(nationalTeamPagePath({ team_type: "first_team", name: "Belgium FC" })).toBeNull();
    expect(nationalTeamPagePath(undefined)).toBeNull();
  });
});
