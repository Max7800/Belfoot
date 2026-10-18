import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isNationalTeam, isNationalTeamsCompetition, nationalTeamPatch, nationalTeamTraits } from "@/modules/football/nationalClassification";
import apifootball from "@/modules/football/apifootball";
import { registerProvider } from "@/modules/football/providers";
import { syncCompetition } from "@/modules/football/syncCompetition";
import { syncSquads } from "@/modules/football/syncSquads";
import { discoverBelgians } from "@/modules/football/discoverPlayers";
import { syncPlayerCareers } from "@/modules/football/syncPlayerCareers";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const PROVIDER = "testprov";
const NOW = new Date();
const YEAR = NOW.getUTCMonth() >= 6 ? NOW.getUTCFullYear() : NOW.getUTCFullYear() - 1;
const LABEL = `${YEAR}-${YEAR + 1}`;

describe("nationalTeamTraits", () => {
  it("catégorie et genre d'après le nom API", () => {
    expect(nationalTeamTraits("Germany")).toEqual({ category: "senior", gender: "men" });
    expect(nationalTeamTraits("Belgium U21")).toEqual({ category: "u21", gender: "men" });
    expect(nationalTeamTraits("Morocco U20 W")).toEqual({ category: "u20", gender: "women" });
    expect(nationalTeamTraits("Belgium W")).toEqual({ category: "women", gender: "women" });
    expect(nationalTeamTraits("France Women")).toEqual({ category: "women", gender: "women" });
  });

  it("catégorie d'âge inconnue : non inventée", () => {
    expect(nationalTeamTraits("Germany U14")).toEqual({ category: null, gender: "men" });
    // U15 et U16 sont désormais des catégories connues (sélections de jeunes).
    expect(nationalTeamTraits("Germany U16")).toEqual({ category: "u16", gender: "men" });
    expect(nationalTeamTraits("Belgium U16 W")).toEqual({ category: "u16", gender: "women" });
  });
});

describe("nationalTeamPatch", () => {
  const mistyped = { id: "c", name: "Germany", team_type: "first_team", national_category: null, national_gender: null, locked: false };

  it("sélection typée comme un club : reclassée", () => {
    expect(nationalTeamPatch(mistyped, { national: true, name: "Germany" })).toEqual({ team_type: "national", national_category: "senior", national_gender: "men" });
    expect(nationalTeamPatch({ ...mistyped, name: "Morocco U20 W", team_type: "youth" }, { national: true, name: "Morocco U20 W" })).toEqual({ team_type: "national", national_category: "u20", national_gender: "women" });
  });

  it("valeurs éditoriales et verrous respectés", () => {
    expect(nationalTeamPatch({ ...mistyped, locked: true }, { national: true })).toEqual({});
    expect(nationalTeamPatch({ ...mistyped, team_type: "national", national_category: "u23", national_gender: "men" }, { national: true, name: "Germany" })).toEqual({});
    expect(nationalTeamPatch({ ...mistyped, national_category: "u23" }, { national: true })).toEqual({ team_type: "national", national_gender: "men" });
  });

  it("club ordinaire, équipe de jeunes ou féminine de club : jamais reclassé", () => {
    expect(nationalTeamPatch(mistyped, { national: false, name: "Germany" })).toEqual({});
    expect(nationalTeamPatch({ ...mistyped, name: "Club Brugge U19", team_type: "youth" }, { national: false, name: "Club Brugge U19" })).toEqual({});
    expect(nationalTeamPatch({ ...mistyped, name: "Anderlecht W", team_type: "women" }, { name: "Anderlecht W" })).toEqual({});
  });
});

describe("isNationalTeam / isNationalTeamsCompetition", () => {
  it("reconnaît une sélection par son type, sa catégorie, l'indicateur API ou sa compétition", () => {
    expect(isNationalTeam({ team_type: "national" })).toBe(true);
    expect(isNationalTeam({ team_type: "first_team", national_category: "senior" })).toBe(true);
    expect(isNationalTeam({ team_type: "first_team", ext: { national: true } })).toBe(true);
    expect(isNationalTeam({ team_type: "first_team" }, { competition_scope: "international" })).toBe(true);
    expect(isNationalTeamsCompetition({ ext: { imported_for: "national-teams" } })).toBe(true);
  });

  it("clubs, équipes de jeunes et féminines de clubs, coupes d'Europe : pas des sélections", () => {
    expect(isNationalTeam({ team_type: "first_team", ext: { national: false } })).toBe(false);
    expect(isNationalTeam({ team_type: "youth" }, { competition_scope: "belgique" })).toBe(false);
    expect(isNationalTeam({ team_type: "women" }, { competition_scope: "etranger" })).toBe(false);
    expect(isNationalTeam({ team_type: "first_team" }, { competition_scope: "europe" })).toBe(false);
  });
});

describe("API-Football : team.national conservé (réponse simulée, aucun appel réseau)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetchClubs et fetchClubById exposent l'indicateur", async () => {
    const response = { response: [{ team: { id: 25, name: "Germany", national: true, country: "Germany", logo: null }, venue: {} }, { team: { id: 157, name: "Bayern München", national: false, country: "Germany" }, venue: { city: "München" } }], errors: [] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify(response) })));
    const clubs = await apifootball.fetchClubs({ external_id: "5", ext: {} }, { season: "2026", apifootballKey: "test" });
    expect(clubs.map((club) => [club.name, club.national])).toEqual([["Germany", true], ["Bayern München", false]]);
    expect((await apifootball.fetchClubById("25", { apifootballKey: "test" })).national).toBe(true);
  });
});

const club = (id, externalId, name, extra = {}) => ({ id, source: PROVIDER, external_id: externalId, name, team_type: "first_team", national_category: null, national_gender: null, locked: false, ext: {}, ...extra });
const NATIONS_LEAGUE = { id: "c-nl", name: "UEFA Nations League", provider: PROVIDER, external_id: "5", competition_scope: "international", competition_type: "hybrid", ext: { country: "World", providerType: "Cup" } };
const PRO_LEAGUE = { id: "c-jpl", name: "Pro League", provider: PROVIDER, external_id: "144", competition_scope: "belgique", competition_type: "league", ext: { country: "Belgium" } };

describe("syncCompetition : les sélections importées sont classées comme telles", () => {
  it("reclasse une sélection mal typée, respecte un verrou, ne touche pas aux clubs (répété)", async () => {
    registerProvider({
      key: PROVIDER,
      async fetchMatches() { return [{ external_id: "9001", home_ext: "25", away_ext: "2", home_name: "Germany", away_name: "France", home_score: 1, away_score: 1, status: "finished", minute: 90, round: "League A - 1", kickoff: `${YEAR}-09-05T18:45:00+00:00` }]; },
      async fetchClubs() { return [{ external_id: "25", name: "Germany", country: "Germany", national: true }, { external_id: "2", name: "France", country: "France", national: true }, { external_id: "9", name: "Spain", country: "Spain", national: true }]; },
    });
    const db = createFakeSupabase({
      clubs: [club("nat-de", "25", "Germany", { ext: { country: "Germany" } }), club("nat-fr", "2", "France", { locked: true }), club("club-brugge-u19", "777", "Club Brugge U19", { team_type: "youth" })],
      competitions: [{ ...NATIONS_LEAGUE }],
      seasons: [{ id: "s-nl", competition_id: "c-nl", label: LABEL }],
    });
    for (let run = 1; run <= 2; run++) await syncCompetition(db, { ...NATIONS_LEAGUE }, { season: LABEL, mode: "full" });

    const rows = Object.fromEntries(db.rows("clubs").map((row) => [row.external_id, row]));
    expect(rows["25"]).toMatchObject({ team_type: "national", national_category: "senior", national_gender: "men", ext: { country: "Germany", national: true } });
    expect(rows["2"]).toMatchObject({ team_type: "first_team", locked: true });
    expect(rows["9"]).toMatchObject({ team_type: "national", national_category: "senior" });
    expect(rows["777"]).toMatchObject({ team_type: "youth" });
  });
});

// Effectifs : un international belge de Club Brugge, appelé avec la Belgique, et
// un joueur de la Serbie (sélection encore typée « first_team » en base).
const playersSeed = () => [
  { id: "p-be", source: PROVIDER, external_id: "100", name: "Joueur Belge", nationality: "Belgium", club_id: "club-brugge", country: "Belgium", competition: "Pro League", locked: false, tracked: true, active: true, ext: {} },
  { id: "p-rs", source: PROVIDER, external_id: "200", name: "Joueur Serbe", nationality: "Serbia", club_id: "club-anderlecht", country: "Belgium", competition: "Pro League", locked: false, tracked: false, active: true, ext: {} },
];
const apiPlayer = (id, nationality) => ({ external_id: id, name: `Joueur ${id}`, nationality, birth_date: null, position: "Midfielder", photo_url: null, age: 25, stats: { appearances: 2, lineups: 2, minutes: 180, goals: 0, assists: 1, yellow: 0, red: 0, rating: 7 } });

function nationsDb() {
  return createFakeSupabase({
    clubs: [club("nat-be", "1", "Belgique", { team_type: "national", national_category: "senior", national_followed: true }), club("nat-rs", "14", "Serbia"), club("club-brugge", "569", "Club Brugge KV"), club("club-anderlecht", "554", "Anderlecht")],
    competitions: [{ ...NATIONS_LEAGUE }],
    seasons: [{ id: "s-nl", competition_id: "c-nl", label: LABEL }],
    matches: [{ id: "m-nl", source: PROVIDER, external_id: "9001", competition_id: "c-nl", season_id: "s-nl", home_club_id: "nat-be", away_club_id: "nat-rs" }],
    players: playersSeed(),
    player_team_seasons: [
      { id: "pts-be", player_id: "p-be", club_id: "club-brugge", season: String(YEAR), season_start_year: YEAR, active: true, is_primary: true, source: PROVIDER, external_id: "100", locked: false },
      { id: "pts-rs", player_id: "p-rs", club_id: "club-anderlecht", season: String(YEAR), season_start_year: YEAR, active: true, is_primary: true, source: PROVIDER, external_id: "200", locked: false },
    ],
    national_team_callups: [{ id: "callup-be", national_team_id: "nat-be", player_id: "p-be", season: LABEL, active: true, source: PROVIDER, locked: false }],
  });
}

const expectClubsIntact = (db) => {
  expect(db.rows("players").find((row) => row.id === "p-be")).toMatchObject({ club_id: "club-brugge", country: "Belgium", competition: "Pro League" });
  expect(db.rows("players").find((row) => row.id === "p-rs")).toMatchObject({ club_id: "club-anderlecht", country: "Belgium", competition: "Pro League" });
  expect(db.rows("player_team_seasons").map((row) => row.id).sort()).toEqual(["pts-be", "pts-rs"]);
  expect(db.rows("player_team_seasons").every((row) => row.active)).toBe(true);
};

describe("syncSquads sur une compétition de sélections", () => {
  beforeEach(() => {
    registerProvider({
      key: PROVIDER,
      async fetchSquadPlayers(team) { return team.external_id === "1" ? [apiPlayer("100", "Belgium"), apiPlayer("300", "Belgium")] : team.external_id === "14" ? [apiPlayer("200", "Serbia")] : []; },
      // Convocation actuelle : les joueurs absents ne doivent JAMAIS désactiver d'affectation.
      async fetchCurrentSquad(team) { return team.external_id === "1" ? [{ external_id: "300", name: "Joueur 300", ext: {} }] : []; },
    });
  });

  it("aucune affectation de club, aucun club actuel modifié, convocations intactes (répété)", async () => {
    const db = nationsDb();
    for (let run = 1; run <= 3; run++) {
      const result = await syncSquads(db, { ...NATIONS_LEAGUE }, { season: String(YEAR) });
      expect(result.detail).toContain("2 sélection(s) : aucune affectation de club");
      expectClubsIntact(db);
    }
    // Nouveau joueur appelé : fiche créée sans club inventé.
    expect(db.rows("players").find((row) => row.external_id === "300")).toMatchObject({ tracked: false });
    expect(db.rows("players").find((row) => row.external_id === "300").club_id ?? null).toBeNull();
    // Parcours international conservé : statistiques rattachées à la sélection.
    const newcomer = db.rows("players").find((row) => row.external_id === "300");
    expect(db.rows("player_season_stats").filter((row) => row.club_id === "nat-be").map((row) => row.player_id).sort()).toEqual(["p-be", newcomer.id].sort());
    expect(db.rows("player_season_stats").filter((row) => row.club_id === "nat-rs")).toHaveLength(1);
    expect(db.rows("national_team_callups")).toEqual([expect.objectContaining({ id: "callup-be", active: true })]);
  });

  it("la découverte des Belges sur une sélection ne crée pas non plus d'affectation", async () => {
    const db = nationsDb();
    for (let run = 1; run <= 2; run++) await discoverBelgians(db, { ...NATIONS_LEAGUE }, { season: String(YEAR) });
    expectClubsIntact(db);
  });
});

describe("syncSquads sur un championnat : comportement inchangé", () => {
  it("équipe première, équipe de jeunes et équipe féminine de club gardent leurs affectations", async () => {
    registerProvider({
      key: PROVIDER,
      async fetchSquadPlayers(team) { return { 569: [apiPlayer("100", "Belgium")], 570: [apiPlayer("400", "Belgium")], 571: [apiPlayer("500", "Belgium")] }[team.external_id] || []; },
      async fetchCurrentSquad() { return []; },
    });
    const db = createFakeSupabase({
      clubs: [club("club-brugge", "569", "Club Brugge KV", { ext: { country: "Belgium" } }), club("club-brugge-u19", "570", "Club Brugge U19", { team_type: "youth", parent_club_id: "club-brugge" }), club("club-brugge-w", "571", "Club Brugge W", { team_type: "women" })],
      competitions: [{ ...PRO_LEAGUE }],
      seasons: [{ id: "s-jpl", competition_id: "c-jpl", label: LABEL }],
      matches: [
        { id: "m1", source: PROVIDER, external_id: "1", competition_id: "c-jpl", season_id: "s-jpl", home_club_id: "club-brugge", away_club_id: "club-brugge-u19" },
        { id: "m2", source: PROVIDER, external_id: "2", competition_id: "c-jpl", season_id: "s-jpl", home_club_id: "club-brugge-w", away_club_id: "club-brugge" },
      ],
      players: [],
    });
    for (let run = 1; run <= 2; run++) await syncSquads(db, { ...PRO_LEAGUE }, { season: String(YEAR) });

    const byClub = Object.fromEntries(db.rows("player_team_seasons").map((row) => [row.club_id, row]));
    expect(byClub["club-brugge"]).toMatchObject({ is_primary: true, squad_role: "first_team", active: true });
    expect(byClub["club-brugge-u19"]).toMatchObject({ is_primary: false, squad_role: "youth" });
    expect(byClub["club-brugge-w"]).toMatchObject({ is_primary: false, squad_role: "women" });
    expect(db.rows("player_team_seasons")).toHaveLength(3);
    expect(db.rows("players").find((row) => row.external_id === "100")).toMatchObject({ club_id: "club-brugge", competition: "Pro League" });
  });
});

describe("syncPlayerCareers : une sélection de l'historique n'est pas un club", () => {
  it("reclasse la sélection et n'écrit que l'affectation du vrai club", async () => {
    registerProvider({
      key: PROVIDER,
      async fetchPlayerCareer() {
        return [
          { team: { external_id: "194", name: "Ajax", logo_url: null, national: false }, season: "2026-2027", ext: {} },
          { team: { external_id: "31", name: "Morocco U23", logo_url: null, national: true }, season: "2026-2027", ext: {} },
        ];
      },
    });
    const db = createFakeSupabase({
      clubs: [club("club-ajax", "194", "Ajax"), club("nat-ma-u23", "31", "Morocco U23")],
      competitions: [{ id: "c-ere", name: "Eredivisie", provider: PROVIDER, external_id: "88", ext: { country: "Netherlands" } }],
      players: [{ id: "p-1", source: PROVIDER, external_id: "396202", name: "Rayane Bounida", nationality: "Belgium, Maroc", career_sync_status: "pending", ext: {} }],
    });
    for (let run = 1; run <= 2; run++) await syncPlayerCareers(db, { id: "c-ere", name: "Eredivisie", provider: PROVIDER }, { playerId: "p-1" });

    expect(db.rows("clubs").find((row) => row.id === "nat-ma-u23")).toMatchObject({ team_type: "national", national_category: "u23", national_gender: "men" });
    expect(db.rows("player_team_seasons").map((row) => row.club_id)).toEqual(["club-ajax"]);
  });
});
