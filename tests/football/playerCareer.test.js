import { describe, expect, it } from "vitest";
import { careerStints, resolveCurrentClubId } from "@/lib/playerCareer";

// Cas réels de l'audit du 26/10/2026 (fiches De Bruyne et Godts).
const clubsById = {
  belgium: { id: "belgium", name: "Belgium", team_type: "national" },
  belgiumU21: { id: "belgiumU21", name: "Belgium U21", team_type: "national", national_category: "U21" },
  city: { id: "city", name: "Manchester City", team_type: "first_team" },
  napoli: { id: "napoli", name: "Napoli", team_type: "first_team" },
  ajax: { id: "ajax", name: "Ajax", team_type: "first_team" },
  psg: { id: "psg", name: "Paris Saint Germain", team_type: "first_team" },
};
const membership = (club_id, season_start_year, extra = {}) => ({ id: `${club_id}-${season_start_year}`, club_id, season_start_year, season: `${season_start_year}-${season_start_year + 1}`, active: true, is_primary: false, ...extra });

describe("club actuel d'un joueur", () => {
  it("De Bruyne : Napoli, ni la sélection marquée principale ni l'ancien club resté actif", () => {
    const memberships = [membership("belgium", 2026, { is_primary: true }), membership("city", 2024), membership("napoli", 2026)];
    expect(resolveCurrentClubId({ player: { club_id: "belgium", nationality: "Belgium" }, memberships, clubsById })).toBe("napoli");
  });
  it("Godts : PSG (club_id correct) plutôt que la sélection ou Ajax", () => {
    const memberships = [membership("belgium", 2026, { is_primary: true }), membership("belgiumU21", 2025), membership("ajax", 2025, { active: false })];
    expect(resolveCurrentClubId({ player: { club_id: "psg", nationality: "Belgium" }, memberships, clubsById })).toBe("psg");
  });
  it("même saison : la principale d'abord, sinon la plus récemment rejointe", () => {
    const memberships = [membership("ajax", 2026, { joined_at: "2026-09-01" }), membership("psg", 2026, { is_primary: true, joined_at: "2026-07-01" })];
    expect(resolveCurrentClubId({ player: {}, memberships, clubsById })).toBe("psg");
    const unflagged = [membership("ajax", 2026, { joined_at: "2026-07-01" }), membership("psg", 2026, { joined_at: "2026-09-01" })];
    expect(resolveCurrentClubId({ player: {}, memberships: unflagged, clubsById })).toBe("psg");
  });
  it("aucune affectation active : club_id hors sélection, sinon la dernière affectation en club, sinon rien", () => {
    const old = [membership("ajax", 2023, { active: false }), membership("city", 2021, { active: false })];
    expect(resolveCurrentClubId({ player: { club_id: "psg" }, memberships: old, clubsById })).toBe("psg");
    expect(resolveCurrentClubId({ player: { club_id: "belgium", nationality: "Belgium" }, memberships: old, clubsById })).toBe("ajax");
    expect(resolveCurrentClubId({ player: { club_id: "belgium", nationality: "Belgium" }, memberships: [membership("belgium", 2026)], clubsById })).toBeNull();
  });
  it("saison lue depuis le libellé quand season_start_year manque", () => {
    const memberships = [{ club_id: "city", season: "2024-2025", active: true }, { club_id: "napoli", season: "2026-2027", active: true }];
    expect(resolveCurrentClubId({ player: {}, memberships, clubsById })).toBe("napoli");
  });
});

describe("parcours en club", () => {
  it("un seul « actuel », placé en tête ; le reste du plus récent au plus ancien", () => {
    const stints = careerStints([membership("city", 2015), membership("city", 2024), membership("ajax", 2012, { active: false }), membership("napoli", 2026)], "napoli");
    expect(stints.map((stint) => [stint.club_id, stint.is_current])).toEqual([["napoli", true], ["city", false], ["ajax", false]]);
    expect(stints[1]).toMatchObject({ start: 2015, end: 2024 });
    expect(stints[1].seasons).toHaveLength(2);
  });
  it("club actuel en tête même si une autre ligne est plus récente (club_id de la fiche)", () => {
    expect(careerStints([membership("ajax", 2026), membership("psg", 2025)], "psg").map((stint) => stint.club_id)).toEqual(["psg", "ajax"]);
  });
  it("sans club actuel : aucun « actuel »", () => {
    expect(careerStints([membership("city", 2024)], null).some((stint) => stint.is_current)).toBe(false);
  });
});
