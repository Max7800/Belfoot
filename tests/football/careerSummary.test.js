import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { careerSummary } from "@/lib/playerCareer";
import { loadMembershipsForPlayers } from "@/lib/publicFootballData";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Carte de la page Belges : « Au club depuis 2024 · avant : Genk, Standard ».
const clubs = {
  yok: { id: "yok", name: "Yokohama F. Marinos", team_type: "first_team" },
  genk: { id: "genk", name: "KRC Genk", team_type: "first_team" },
  std: { id: "std", name: "Standard Liège", team_type: "first_team" },
  gnk2: { id: "gnk2", name: "Jong Genk", team_type: "u23" },
  ohl: { id: "ohl", name: "OH Leuven", team_type: "first_team" },
  bel: { id: "bel", name: "Belgique U21", team_type: "national" },
};
const m = (club_id, season_start_year) => ({ id: `${club_id}-${season_start_year}`, player_id: "p", club_id, season_start_year });

describe("careerSummary", () => {
  it("arrivée au club actuel = première saison au club ; précédents du plus récent au plus ancien ; sélection écartée", () => {
    const rows = [m("yok", 2024), m("yok", 2025), m("genk", 2021), m("genk", 2022), m("std", 2023), m("bel", 2022)];
    const summary = careerSummary(rows, "yok", clubs);
    expect(summary.since).toBe(2024);
    expect(summary.previous.map((item) => item.name)).toEqual(["Standard Liège", "KRC Genk"]);
    expect(summary.previous[1].range).toBe("2021 — 2023");
    expect(summary.more).toBe(0);
  });
  it("au plus 3 clubs précédents, le reste compté", () => {
    const rows = [m("yok", 2025), m("std", 2024), m("genk", 2023), m("gnk2", 2022), m("ohl", 2021)];
    expect(careerSummary(rows, "yok", clubs)).toMatchObject({ since: 2025, previous: [{ name: "Standard Liège" }, { name: "KRC Genk" }, { name: "Jong Genk" }], more: 1 });
  });
  it("club actuel absent du parcours : pas de date inventée ; club inconnu ignoré ; rien : résumé vide", () => {
    expect(careerSummary([m("genk", 2022), m("zzz", 2020)], "yok", clubs)).toEqual({ since: null, previous: [{ id: "genk", name: "KRC Genk", range: "2022-2023" }], more: 0 });
    expect(careerSummary([], "yok", clubs)).toEqual({ since: null, previous: [], more: 0 });
  });
  it("chargeur : toutes les affectations, même au-delà du plafond de 1 000 lignes", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: `r${String(i).padStart(4, "0")}`, player_id: `p${i % 3}`, club_id: "c", season_start_year: 2000 + (i % 25) }));
    const db = createFakeSupabase({ player_team_seasons: rows }, { maxRows: 1000 });
    expect(await loadMembershipsForPlayers(db, ["p0", "p1", "p2"])).toHaveLength(1500);
  });
  it("page Belges : parcours chargé et affiché sur chaque carte", () => {
    const page = fs.readFileSync("app/belges-a-l-etranger/page.js", "utf8");
    expect(page).toContain("loadMembershipsForPlayers(supabase, playerIds)");
    expect(page).toContain("career: careerSummary(data.memberships[player.id] || [], currentClubId, data.clubs, { nationality: player.nationality })");
    expect(page).toContain("Au club depuis {career.since}");
  });
});

describe("carte de la page Belges : pays en français", () => {
  it("« England » affiché « Angleterre » (frenchNationName sur la carte)", () => {
    expect(fs.readFileSync("app/belges-a-l-etranger/page.js", "utf8")).toContain("{countryFlag(playerCountry)}</span>{frenchNationName(playerCountry)} · {playerCompetition}");
  });
});

describe("page Belges : club actuel d'après les affectations (cas M. Godts, 28/10/2026)", () => {
  // Fiche : club_id = Ajax (réécrit par le balayage de l'Eredivisie, 1 match avant son
  // transfert). Affectations : PSG 2026 active, Belgique 2026 active (sélection), Ajax 2022-2025.
  const clubsById = { ajax: { id: "ajax", name: "Ajax", team_type: "first_team" }, psg: { id: "psg", name: "Paris Saint Germain", team_type: "first_team" }, bel: { id: "bel", name: "Belgique", team_type: "national" } };
  const memberships = [
    { club_id: "ajax", season_start_year: 2025, active: false, is_primary: true },
    { club_id: "ajax", season_start_year: 2026, active: false, is_primary: true, updated_at: "2026-10-25T22:20:31Z" },
    { club_id: "psg", season_start_year: 2026, active: true, is_primary: true, updated_at: "2026-10-26T03:00:44Z" },
    { club_id: "bel", season_start_year: 2026, active: true, is_primary: true, updated_at: "2026-09-29T19:59:08Z" },
  ];
  it("PSG, ni l'Ajax de la fiche ni la sélection", async () => {
    const { resolveCurrentClubId } = await import("@/lib/playerCareer");
    expect(resolveCurrentClubId({ player: { club_id: "ajax", nationality: "Belgium" }, memberships, clubsById })).toBe("psg");
    expect(careerSummary(memberships, "psg", clubsById, { nationality: "Belgium" })).toMatchObject({ since: 2026, previous: [{ name: "Ajax" }] });
  });
  it("la page s'en sert pour le club, le championnat, le parcours et les matchs ; instantané de l'ancien club écarté", () => {
    const page = fs.readFileSync("app/belges-a-l-etranger/page.js", "utf8");
    expect(page).toContain("const currentClubId = resolveCurrentClubId({ player, memberships: data.memberships[player.id] || [], clubsById: data.clubs }) || player.club_id;");
    expect(page).toContain("const club = data.clubs[currentClubId];");
    expect(page).toContain("{ ...player, club_id: currentClubId, competition: null, country: null }");
    expect(page).toContain("resolvePlayerLeague({ player: current,");
    expect(page).toContain("const concernsPlayer = (item, match) => [item.club?.id, item.player.national_team_id]");
    expect(page).toContain("...membershipRows.filter((row) => row.active).map((row) => row.club_id)");
    expect(fs.readFileSync("lib/publicFootballData.js", "utf8")).toContain('select("id,player_id,club_id,season_start_year,active,is_primary,joined_at,updated_at")');
  });
});
