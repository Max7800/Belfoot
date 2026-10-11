import { beforeEach, describe, expect, it } from "vitest";
import { mergeExt, upsertExternal } from "@/modules/football/sync";
import { registerProvider } from "@/modules/football/providers";
import { syncCompetition } from "@/modules/football/syncCompetition";
import { syncNationalTeam } from "@/modules/football/syncNationalTeam";
import { resolveNationalPlayerClubs } from "@/modules/football/resolveNationalPlayerClubs";
import { mapFixture } from "@/modules/football/apifootball";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { rawFixture } from "../helpers/apiFootballFixtures";

const PROVIDER = "testprov";
// Fiche club telle qu'écrite par /teams?league&season (fetchClubs) : contient le pays.
const AJAX_EXT = { external_id: "1", name: "Ajax", logo_url: "ajax.png", city: "Amsterdam", country: "Netherlands", founded_year: 1900, imported_for: "player-career" };
const clubRow = (id, externalId, name, ext, extra = {}) => ({ id, source: PROVIDER, external_id: externalId, name, team_type: "first_team", locked: false, ext, ...extra });

describe("mergeExt", () => {
  it("ajoute et met à jour, sans effacer par une valeur absente", () => {
    expect(mergeExt({ country: "Netherlands", city: "Amsterdam" }, { city: "Amsterdam-Zuid", country: null, founded_year: undefined, logo_url: "a.png" }))
      .toEqual({ country: "Netherlands", city: "Amsterdam-Zuid", logo_url: "a.png" });
  });

  it("tolère un ext existant absent ou invalide", () => {
    expect(mergeExt(null, { country: "Belgium" })).toEqual({ country: "Belgium" });
    expect(mergeExt([], { country: "Belgium" })).toEqual({ country: "Belgium" });
  });
});

describe("upsertExternal — modes ext", () => {
  const seed = () => createFakeSupabase({ clubs: [clubRow("club-ajax", "1", "Ajax", { ...AJAX_EXT }), clubRow("club-lock", "9", "Verrouillé", { country: "Belgium" }, { locked: true })] });
  const minimal = { external_id: "1", name: "AFC Ajax" };

  it("replace (défaut, comportement historique) : ext remplacé", async () => {
    const db = seed();
    await upsertExternal(db, "clubs", PROVIDER, [minimal], ["name"]);
    expect(db.rows("clubs")[0].ext).toEqual(minimal);
  });

  it("keep : ext existant intact, colonnes possédées mises à jour", async () => {
    const db = seed();
    await upsertExternal(db, "clubs", PROVIDER, [minimal], ["name"], { extMode: "keep" });
    expect(db.rows("clubs")[0]).toMatchObject({ name: "AFC Ajax", ext: AJAX_EXT });
  });

  it("merge : ext complété, pays et clés éditoriales conservés", async () => {
    const db = seed();
    await upsertExternal(db, "clubs", PROVIDER, [{ external_id: "1", name: "Ajax", logo_url: "ajax-2026.png", country: null }], ["name", "logo_url"], { extMode: "merge" });
    expect(db.rows("clubs")[0].ext).toEqual({ ...AJAX_EXT, logo_url: "ajax-2026.png" });
  });

  it("création : le payload devient ext quel que soit le mode", async () => {
    const db = seed();
    await upsertExternal(db, "clubs", PROVIDER, [{ external_id: "2", name: "PSV" }], ["name"], { extMode: "keep" });
    expect(db.rows("clubs").find((row) => row.external_id === "2").ext).toEqual({ external_id: "2", name: "PSV" });
  });

  it("une ligne verrouillée reste ignorée ; un mode inconnu est refusé", async () => {
    const db = seed();
    await upsertExternal(db, "clubs", PROVIDER, [{ external_id: "9", name: "Écrasé" }], ["name"], { extMode: "merge" });
    expect(db.rows("clubs").find((row) => row.id === "club-lock")).toMatchObject({ name: "Verrouillé", ext: { country: "Belgium" } });
    await expect(upsertExternal(db, "clubs", PROVIDER, [], [], { extMode: "oops" })).rejects.toThrow("extMode inconnu");
  });
});

const COMPETITION = { id: "comp-1", name: "Eredivisie", provider: PROVIDER, external_id: "88", ext: {} };
const SEASON = { id: "s-1", competition_id: "comp-1", label: "2026-2027" };
const fixture = { external_id: "9001", home_ext: "1", away_ext: "2", home_name: "Ajax", away_name: "PSV", home_score: 1, away_score: 0, status: "finished", minute: 90, round: "Regular Season - 1", kickoff: "2026-08-01T18:00:00+00:00" };

describe("syncCompetition — le pays du club survit", () => {
  const seedCompetition = () => createFakeSupabase({
    clubs: [clubRow("club-ajax", "1", "Ajax", { ...AJAX_EXT }), clubRow("club-psv", "2", "PSV", { external_id: "2", name: "PSV", country: "Netherlands" })],
    competitions: [{ ...COMPETITION }],
    seasons: [{ ...SEASON }],
  });

  it("la liste des clubs en échec n'efface plus le pays (avant : ext = {external_id, name})", async () => {
    registerProvider({ key: PROVIDER, async fetchMatches() { return [{ ...fixture }]; }, async fetchClubs() { throw new Error("timeout"); } });
    const db = seedCompetition();
    for (let run = 1; run <= 2; run++) await syncCompetition(db, { ...COMPETITION }, { season: "2026-2027", mode: "full" });

    expect(db.rows("clubs").find((row) => row.id === "club-ajax").ext).toEqual(AJAX_EXT);
    expect(db.rows("clubs").find((row) => row.id === "club-psv").ext.country).toBe("Netherlands");
  });

  it("une liste des clubs réussie complète la fiche sans perdre les clés absentes", async () => {
    registerProvider({
      key: PROVIDER,
      async fetchMatches() { return [{ ...fixture }]; },
      async fetchClubs() { return [{ external_id: "1", name: "Ajax", logo_url: "ajax-2026.png", city: "Amsterdam", country: null, founded_year: 1900 }]; },
    });
    const db = seedCompetition();
    await syncCompetition(db, { ...COMPETITION }, { season: "2026-2027", mode: "full" });

    expect(db.rows("clubs").find((row) => row.id === "club-ajax").ext).toMatchObject({ country: "Netherlands", imported_for: "player-career", logo_url: "ajax-2026.png" });
  });

  it("mode live : les clubs déjà connus gardent leur fiche", async () => {
    registerProvider({ key: PROVIDER, async fetchLiveMatches() { return [{ ...fixture, status: "live" }]; } });
    const db = seedCompetition();
    await syncCompetition(db, { ...COMPETITION }, { season: "2026-2027", mode: "live" });
    expect(db.rows("clubs").find((row) => row.id === "club-ajax").ext).toEqual(AJAX_EXT);
  });
});

describe("sélections et clubs des internationaux — fiches clubs préservées", () => {
  it("syncNationalTeam : un adversaire déjà connu garde sa fiche ; la sélection est complétée", async () => {
    registerProvider({
      key: "apifootball",
      async fetchClubById() { return { external_id: "1", name: "Belgium", logo_url: "be.png", city: null }; },
      async fetchNationalTeamMatches() { return [mapFixture(rawFixture({ id: 501, date: "2026-09-05T18:45:00+00:00", season: 2026, home: { id: 1, name: "Belgium" }, away: { id: 2, name: "France" } }))]; },
      async fetchCurrentSquad() { return []; },
    });
    const db = createFakeSupabase({
      clubs: [
        { id: "nat-be", source: "apifootball", external_id: "1", name: "Belgique", team_type: "national", locked: false, ext: { country: "Belgium", national: true } },
        { id: "nat-fr", source: "apifootball", external_id: "2", name: "France", team_type: "national", locked: false, ext: { country: "France", national: true, fifa_code: "FRA" } },
      ],
    });
    await syncNationalTeam(db, { teamExternalId: "1", nationalCategory: "senior", season: "2026-2027" });

    expect(db.rows("clubs").find((row) => row.id === "nat-fr").ext).toEqual({ country: "France", national: true, fifa_code: "FRA" });
    expect(db.rows("clubs").find((row) => row.id === "nat-be").ext).toMatchObject({ country: "Belgium", national: true, logo_url: "be.png" });
  });

  it("resolveNationalPlayerClubs : le club résolu garde son pays", async () => {
    registerProvider({
      key: "apifootball",
      async fetchPlayerClubSeason() { return { club: { external_id: "1", name: "Ajax", logo_url: "ajax.png" }, country: "Netherlands", competition: "Eredivisie", nationalLeague: true, position: "Defender" }; },
    });
    const db = createFakeSupabase({
      clubs: [
        { id: "nat-be", source: "apifootball", external_id: "100", name: "Belgique", team_type: "national", locked: false, ext: {} },
        { id: "club-ajax", source: "apifootball", external_id: "1", name: "Ajax", team_type: "first_team", locked: false, ext: { ...AJAX_EXT } },
      ],
      national_team_callups: [{ id: "c-1", national_team_id: "nat-be", player_id: "p-1", season: "2026-2027", active: true }],
      players: [{ id: "p-1", source: "apifootball", external_id: "443829", name: "J. Mokio", club_id: null, country: null, competition: null, locked: false }],
    });
    await resolveNationalPlayerClubs(db, { teamExternalId: "100", season: "2026-2027" });

    expect(db.rows("clubs").find((row) => row.id === "club-ajax").ext).toEqual(AJAX_EXT);
    expect(db.rows("players")[0]).toMatchObject({ club_id: "club-ajax", country: "Netherlands", competition: "Eredivisie" });
  });
});
