import { beforeEach, describe, expect, it } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { syncSquads } from "@/modules/football/syncSquads";
import { discoverBelgians } from "@/modules/football/discoverPlayers";
import { syncTeamTest } from "@/modules/football/syncTeamTest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Saison courante calculée comme syncSquads (bascule au 1er juillet) : le test
// reste valable quelle que soit la date d'exécution.
const now = new Date();
const YEAR = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const CTX = { season: String(YEAR) };
const PROVIDER = "testprov";
const COMPETITION = { id: "comp-1", name: "Pro League", provider: PROVIDER, external_id: "144", ext: { country: "Belgium" } };

// Réponses fictives : /players?team&season (avec nationalité et date) et
// /players/squads (effectif actuel, SANS nationalité ni date de naissance).
const seasonPlayer = (id, nationality, birth_date) => ({ external_id: String(id), name: `Joueur ${id}`, nationality, birth_date, position: "Midfielder", photo_url: null, age: 22, stats: { appearances: 3, lineups: 2, minutes: 200, goals: 1, assists: 0, yellow: 0, red: 0, rating: 6.9 } });
const squadPlayer = (id) => ({ external_id: String(id), name: `Joueur ${id}`, age: 22, number: Number(id), position: "Midfielder", photo_url: null, ext: {} });

const SEASON_PLAYERS = [
  seasonPlayer(1, "Morocco", "2004-02-02"),
  seasonPlayer(2, "DR Congo", "2002-03-03"),
  seasonPlayer(4, "Belgium", "2000-04-04"),
  seasonPlayer(5, "Morocco", "2005-06-06"),
  seasonPlayer(6, "Belgium", "2005-05-05"),
  seasonPlayer(7, "Belgium", "2001-01-01"),
];
// Le joueur 3 et la recrue 8 figurent dans l'effectif actuel mais pas encore
// dans les statistiques de la saison : l'API ne fournit pour eux ni nationalité
// ni date de naissance.
const CURRENT_SQUAD = [1, 2, 3, 4, 5, 6, 7, 8].map(squadPlayer);

const existingPlayers = () => [
  { id: "p-manual", source: PROVIDER, external_id: "1", name: "Joueur 1", nationality: "Belgique, Maroc", birth_date: "2004-01-01", locked: false, tracked: true, active: true, ext: { editorial_nationality: true, editorial_birth_date: true } },
  { id: "p-dual", source: PROVIDER, external_id: "2", name: "Joueur 2", nationality: "Belgium, DR Congo", birth_date: null, locked: false, tracked: true, active: true, ext: {} },
  { id: "p-missing", source: PROVIDER, external_id: "3", name: "Joueur 3", nationality: "Belgium", birth_date: "2003-05-05", locked: false, tracked: true, active: true, ext: {} },
  { id: "p-other-team", source: PROVIDER, external_id: "4", name: "Joueur 4", nationality: "Belgium", national_team_id: "nat-ma", national_team_locked: true, locked: false, tracked: true, active: true, ext: {} },
  { id: "p-watch", source: PROVIDER, external_id: "5", name: "Joueur 5", nationality: "Morocco", locked: false, tracked: true, active: true, ext: { binational_watch: true } },
  { id: "p-fill", source: PROVIDER, external_id: "6", name: "Joueur 6", nationality: "Belgium", birth_date: null, locked: false, tracked: false, active: true, ext: {} },
  { id: "p-update", source: PROVIDER, external_id: "7", name: "Joueur 7", nationality: "France", birth_date: "2001-01-01", locked: false, tracked: false, active: true, ext: {} },
];

function seedDb() {
  return createFakeSupabase({
    clubs: [
      { id: "club-a", source: PROVIDER, external_id: "10", name: "Club A", team_type: "first_team", locked: false },
      { id: "club-b", source: PROVIDER, external_id: "11", name: "Club B", team_type: "first_team", locked: false },
      { id: "nat-ma", source: PROVIDER, external_id: "31", name: "Maroc", team_type: "national", locked: false },
    ],
    competitions: [{ ...COMPETITION }],
    seasons: [{ id: "season-cur", competition_id: "comp-1", label: `${YEAR}-${YEAR + 1}` }],
    matches: [{ id: "m-1", source: PROVIDER, external_id: "9001", competition_id: "comp-1", season_id: "season-cur", home_club_id: "club-a", away_club_id: "club-b" }],
    players: existingPlayers(),
  });
}

const player = (db, id) => db.rows("players").find((row) => row.id === id);

beforeEach(() => {
  registerProvider({
    key: PROVIDER,
    async fetchSquadPlayers(club) { return club.external_id === "10" ? SEASON_PLAYERS.map((row) => ({ ...row })) : []; },
    async fetchCurrentSquad(club) { return club.external_id === "10" ? CURRENT_SQUAD.map((row) => ({ ...row })) : []; },
  });
});

function expectProtectedIdentities(db) {
  // Nationalité et date fixées dans l'admin : intactes malgré l'API différente.
  expect(player(db, "p-manual")).toMatchObject({ nationality: "Belgique, Maroc", birth_date: "2004-01-01" });
  // Double nationalité connue : non réduite à « DR Congo » ; date absente remplie.
  expect(player(db, "p-dual")).toMatchObject({ nationality: "Belgium, DR Congo", birth_date: "2002-03-03" });
  // Absent des statistiques : nationalité et date NON effacées (bug P0-4).
  expect(player(db, "p-missing")).toMatchObject({ nationality: "Belgium", birth_date: "2003-05-05" });
  // Belge représentant une autre sélection : sélection et nationalité conservées.
  expect(player(db, "p-other-team")).toMatchObject({ nationality: "Belgium", national_team_id: "nat-ma", national_team_locked: true });
  // Binational classé manuellement à suivre : marqueur conservé.
  expect(player(db, "p-watch").ext).toMatchObject({ binational_watch: true });
  // Données non verrouillées : mise à jour normale.
  expect(player(db, "p-fill")).toMatchObject({ nationality: "Belgium", birth_date: "2005-05-05" });
  expect(player(db, "p-update")).toMatchObject({ nationality: "Belgium", birth_date: "2001-01-01" });
}

describe("syncSquads — identités protégées sur plusieurs synchronisations", () => {
  it("conserve les valeurs manuelles et connues, met à jour le reste, sans doublon", async () => {
    const db = seedDb();
    const ids = db.rows("players").map((row) => row.id);
    for (let run = 1; run <= 3; run++) {
      await syncSquads(db, { ...COMPETITION }, CTX);
      expectProtectedIdentities(db);
    }
    // Une seule fiche par identifiant provider ; identifiants internes conservés.
    expect(db.rows("players")).toHaveLength(8);
    expect(new Set(db.rows("players").map((row) => row.external_id)).size).toBe(8);
    for (const id of ids) expect(player(db, id)).toBeTruthy();
    // La recrue sans nationalité connue est créée sans valeur inventée.
    expect(db.rows("players").find((row) => row.external_id === "8")).toMatchObject({ nationality: null, birth_date: null, tracked: false });
  });
});

describe("discoverBelgians — double nationalité non réduite", () => {
  it("un Belge binational saisi « Belgique, Maroc » n'est pas ramené à « Belgium »", async () => {
    registerProvider({ key: PROVIDER, async fetchSquadPlayers() { return [seasonPlayer(20, "Belgium", "2006-06-06")]; } });
    const db = seedDb();
    db.rows("players").push({ id: "p-bina", source: PROVIDER, external_id: "20", name: "Joueur 20", nationality: "Belgique, Maroc", birth_date: null, locked: false, tracked: true, active: true, ext: {} });
    for (let run = 1; run <= 2; run++) await discoverBelgians(db, { ...COMPETITION }, CTX);

    expect(player(db, "p-bina")).toMatchObject({ nationality: "Belgique, Maroc", birth_date: "2006-06-06" });
    expect(db.rows("players").filter((row) => row.external_id === "20")).toHaveLength(1);
  });
});

describe("syncTeamTest — identité protégée", () => {
  it("ne remplace ni la nationalité ni la date fixées dans l'admin", async () => {
    registerProvider({
      key: PROVIDER,
      async fetchClubById() { return { external_id: "10", name: "Club A", logo_url: null, city: null }; },
      async fetchTeamMatches() { return []; },
      async fetchSquadPlayers() { return [seasonPlayer(1, "Belgium", "2004-02-02")]; },
    });
    const db = seedDb();
    for (let run = 1; run <= 2; run++) await syncTeamTest(db, { ...COMPETITION }, { ...CTX, teamExternalId: "10" });

    expect(player(db, "p-manual")).toMatchObject({ nationality: "Belgique, Maroc", birth_date: "2004-01-01" });
  });
});
