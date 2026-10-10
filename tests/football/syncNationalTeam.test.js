import { beforeEach, describe, expect, it } from "vitest";
import { mapFixture } from "@/modules/football/apifootball";
import { registerProvider } from "@/modules/football/providers";
import { syncNationalTeam } from "@/modules/football/syncNationalTeam";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { rawFixture } from "../helpers/apiFootballFixtures";

// Le cron national-refresh demande toujours la saison courante : c'est
// précisément la valeur qui ne doit plus être recopiée sur les anciens matchs.
const CRON_CTX = { teamExternalId: "1", nationalCategory: "senior", season: "2026-2027" };

let fixtures = [];
let squad = [];

// Remplace le provider réel (importé par mapFixture) : aucun appel réseau.
function registerFakeProvider() {
  registerProvider({
    key: "apifootball",
    async fetchClubById(id) {
      return { external_id: String(id), name: "Belgium", logo_url: null, city: null };
    },
    async fetchNationalTeamMatches() {
      return fixtures.map(mapFixture);
    },
    async fetchCurrentSquad() {
      return squad;
    },
  });
}

const NL = { leagueId: 5, leagueName: "UEFA Nations League" };
const FRIENDLIES = { leagueId: 10, leagueName: "Friendlies" };
const EURO = { leagueId: 4, leagueName: "Euro Championship" };

function seasonLabelOf(db, externalId) {
  const match = db.rows("matches").find((row) => row.external_id === externalId);
  if (!match) throw new Error(`match ${externalId} absent`);
  return db.rows("seasons").find((row) => row.id === match.season_id)?.label ?? null;
}

function seasonLabelsFor(db, leagueExternalId) {
  const competition = db.rows("competitions").find((row) => row.external_id === leagueExternalId);
  return db.rows("seasons").filter((row) => row.competition_id === competition.id).map((row) => row.label).sort();
}

beforeEach(() => {
  fixtures = [];
  squad = [{ external_id: "100", name: "Joueur Test", number: 7, position: "Midfielder", photo_url: null, age: 30, ext: {} }];
  registerFakeProvider();
});

describe("syncNationalTeam — saison de chaque match", () => {
  it("rattache chaque match à SA saison API, jamais à la saison du cron", async () => {
    fixtures = [
      rawFixture({ id: 101, date: "2024-09-07T18:45:00+00:00", season: 2024, ...NL }),
      rawFixture({ id: 102, date: "2026-09-05T18:45:00+00:00", season: 2026, status: "NS", goals: { home: null, away: null }, ...NL }),
      rawFixture({ id: 103, date: "2026-03-27T19:45:00+00:00", season: 2026, ...FRIENDLIES }),
      rawFixture({ id: 104, date: "2024-06-17T19:00:00+00:00", season: 2024, ...EURO }),
    ];
    const db = createFakeSupabase();
    const detail = await syncNationalTeam(db, CRON_CTX);

    expect(seasonLabelOf(db, "101")).toBe("2024-2025");
    expect(seasonLabelOf(db, "102")).toBe("2026-2027");
    expect(seasonLabelOf(db, "103")).toBe("2026-2027");
    expect(seasonLabelOf(db, "104")).toBe("2024-2025");
    expect(detail).toContain("saisons API : 2024-2025 ×2, 2026-2027 ×2");
    expect(detail).not.toContain("avertissement");
  });

  it("ne crée que les saisons réellement rencontrées (pas de 2026-2027 parasite pour l'Euro 2024)", async () => {
    fixtures = [
      rawFixture({ id: 101, date: "2024-09-07T18:45:00+00:00", season: 2024, ...NL }),
      rawFixture({ id: 102, date: "2026-09-05T18:45:00+00:00", season: 2026, ...NL }),
      rawFixture({ id: 104, date: "2024-06-17T19:00:00+00:00", season: 2024, ...EURO }),
    ];
    const db = createFakeSupabase();
    await syncNationalTeam(db, CRON_CTX);

    expect(seasonLabelsFor(db, "5")).toEqual(["2024-2025", "2026-2027"]);
    expect(seasonLabelsFor(db, "4")).toEqual(["2024-2025"]);
  });

  it("répare un ancien match mal rattaché à la saison du cron", async () => {
    const db = createFakeSupabase({
      competitions: [{ id: "comp-nl", provider: "apifootball", source: "apifootball", external_id: "5", name: "UEFA Nations League" }],
      seasons: [{ id: "season-2026", competition_id: "comp-nl", label: "2026-2027" }],
      matches: [{ id: "m-101", source: "apifootball", external_id: "101", competition_id: "comp-nl", season_id: "season-2026", locked: false }],
    });
    fixtures = [rawFixture({ id: 101, date: "2024-09-07T18:45:00+00:00", season: 2024, ...NL })];
    await syncNationalTeam(db, CRON_CTX);

    expect(seasonLabelOf(db, "101")).toBe("2024-2025");
    expect(db.rows("matches")).toHaveLength(1);
  });

  it("saison API inhabituelle : conservée et signalée, sans bloquer", async () => {
    fixtures = [rawFixture({ id: 105, date: "2026-03-12T19:45:00+00:00", season: 2019, ...FRIENDLIES })];
    const db = createFakeSupabase();
    const detail = await syncNationalTeam(db, CRON_CTX);

    expect(seasonLabelOf(db, "105")).toBe("2019-2020");
    expect(detail).toContain("1 saison(s) API inhabituelle(s), conservée(s)");
    expect(detail).toContain("saison API 2019");
  });
});

describe("syncNationalTeam — saison API absente ou ambiguë", () => {
  const seed = () => createFakeSupabase({
    competitions: [{ id: "comp-nl", provider: "apifootball", source: "apifootball", external_id: "5", name: "UEFA Nations League" }],
    seasons: [{ id: "season-keep", competition_id: "comp-nl", label: "2024-2025" }],
    matches: [{ id: "m-500", source: "apifootball", external_id: "500", competition_id: "comp-nl", season_id: "season-keep", home_score: null, away_score: null, locked: false }],
  });

  it("un match existant garde sa saison, mais son score est mis à jour", async () => {
    fixtures = [rawFixture({ id: 500, date: "2024-10-10T18:45:00+00:00", goals: { home: 2, away: 0 }, ...NL })];
    const db = seed();
    const detail = await syncNationalTeam(db, CRON_CTX);

    const row = db.rows("matches").find((match) => match.external_id === "500");
    expect(row.season_id).toBe("season-keep");
    expect(row.home_score).toBe(2);
    expect(detail).toContain("1 match(s) existant(s) sans saison API exploitable : saison actuelle conservée");
    expect(detail).not.toContain("nouveau(x) match(s)");
  });

  it("une saison ambiguë (« 2024-2025 ») est traitée comme absente", async () => {
    fixtures = [rawFixture({ id: 500, date: "2024-10-10T18:45:00+00:00", season: "2024-2025", ...NL })];
    const db = seed();
    await syncNationalTeam(db, CRON_CTX);

    expect(db.rows("matches").find((match) => match.external_id === "500").season_id).toBe("season-keep");
  });

  it("un nouveau match sans saison est inséré sans saison et signalé", async () => {
    fixtures = [rawFixture({ id: 201, date: "2026-11-14T19:45:00+00:00", status: "NS", goals: { home: null, away: null }, ...FRIENDLIES })];
    const db = createFakeSupabase();
    const detail = await syncNationalTeam(db, CRON_CTX);

    const row = db.rows("matches").find((match) => match.external_id === "201");
    expect(row).toBeTruthy();
    expect(row.season_id ?? null).toBeNull();
    expect(db.rows("seasons")).toHaveLength(0);
    expect(detail).toContain("1 nouveau(x) match(s) inséré(s) sans saison");
    expect(detail).not.toContain("saison actuelle conservée");
  });
});

describe("syncNationalTeam — comportements existants préservés", () => {
  it("un match verrouillé n'est jamais modifié, ne crée aucune saison et n'entre dans aucun compteur", async () => {
    const lockedMatch = (id) => ({ id: `m-${id}`, source: "apifootball", external_id: String(id), competition_id: "comp-nl", season_id: "season-manual", home_score: 0, away_score: 0, locked: true });
    const db = createFakeSupabase({
      competitions: [{ id: "comp-nl", provider: "apifootball", source: "apifootball", external_id: "5", name: "UEFA Nations League" }],
      seasons: [{ id: "season-manual", competition_id: "comp-nl", label: "2026-2027" }],
      matches: [lockedMatch(600), lockedMatch(601), lockedMatch(602)],
    });
    fixtures = [
      // Verrouillés : saison valide, saison inhabituelle, saison absente.
      rawFixture({ id: 600, date: "2024-09-07T18:45:00+00:00", season: 2024, goals: { home: 3, away: 3 }, ...NL }),
      rawFixture({ id: 601, date: "2026-03-12T19:45:00+00:00", season: 2019, goals: { home: 3, away: 3 }, ...NL }),
      rawFixture({ id: 602, date: "2024-10-10T18:45:00+00:00", goals: { home: 3, away: 3 }, ...NL }),
      // Non verrouillé : seul match réellement traité.
      rawFixture({ id: 101, date: "2026-09-05T18:45:00+00:00", season: 2026, ...NL }),
    ];
    const detail = await syncNationalTeam(db, CRON_CTX);

    for (const id of ["600", "601", "602"]) {
      expect(db.rows("matches").find((match) => match.external_id === id)).toMatchObject({ season_id: "season-manual", home_score: 0, away_score: 0, locked: true });
    }
    // Aucune saison 2024-2025 ni 2019-2020 créée pour les matchs verrouillés.
    expect(seasonLabelsFor(db, "5")).toEqual(["2026-2027"]);
    expect(seasonLabelOf(db, "101")).toBe("2026-2027");
    expect(detail).toContain("saisons API : 2026-2027 ×1");
    expect(detail).toContain("matchs verrouillés ignorés : 3");
    expect(detail).not.toContain("avertissement");
  });

  it("les convocations restent rattachées à la saison demandée (effectif actuel)", async () => {
    const db = createFakeSupabase({
      clubs: [{ id: "club-be", source: "apifootball", external_id: "1", name: "Belgique", team_type: "national", locked: false }],
      national_team_callups: [{ id: "callup-old", national_team_id: "club-be", player_id: "player-old", season: "2025-2026", active: true, source: "apifootball", locked: false }],
    });
    fixtures = [rawFixture({ id: 101, date: "2024-09-07T18:45:00+00:00", season: 2024, ...NL })];
    await syncNationalTeam(db, CRON_CTX);

    const callups = db.rows("national_team_callups");
    expect(callups.find((row) => row.id === "callup-old").active).toBe(false);
    const player = db.rows("players").find((row) => row.external_id === "100");
    expect(callups.find((row) => row.player_id === player.id)).toMatchObject({ season: "2026-2027", active: true, national_team_id: "club-be" });
  });

  it("crée les compétitions internationales comme avant", async () => {
    fixtures = [rawFixture({ id: 101, date: "2024-09-07T18:45:00+00:00", season: 2024, ...NL })];
    const db = createFakeSupabase();
    await syncNationalTeam(db, CRON_CTX);

    expect(db.rows("competitions").find((row) => row.external_id === "5")).toMatchObject({
      provider: "apifootball",
      slug: "international-5",
      competition_scope: "international",
      competition_type: "cup",
      public_visible: false,
    });
  });

  it("une seconde exécution identique ne crée aucun doublon", async () => {
    fixtures = [
      rawFixture({ id: 101, date: "2024-09-07T18:45:00+00:00", season: 2024, ...NL }),
      rawFixture({ id: 102, date: "2026-09-05T18:45:00+00:00", season: 2026, ...NL }),
      rawFixture({ id: 201, date: "2026-11-14T19:45:00+00:00", ...FRIENDLIES }),
    ];
    const db = createFakeSupabase();
    await syncNationalTeam(db, CRON_CTX);
    const counts = () => ["matches", "seasons", "competitions", "clubs", "players", "national_team_callups"].map((name) => db.rows(name).length);
    const first = counts();
    const secondDetail = await syncNationalTeam(db, CRON_CTX);

    expect(counts()).toEqual(first);
    expect(seasonLabelOf(db, "101")).toBe("2024-2025");
    // Au second passage, le match sans saison existe déjà : il n'est plus « nouveau ».
    expect(secondDetail).toContain("saison actuelle conservée");
    expect(secondDetail).not.toContain("nouveau(x) match(s)");
  });
});
