import { beforeEach, describe, expect, it } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { syncCompetition } from "@/modules/football/syncCompetition";
import { syncEvents } from "@/modules/football/syncEvents";
import { syncLineups } from "@/modules/football/syncLineups";
import { syncTransfers } from "@/modules/football/syncTransfers";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { clubId, manyClubs, manyPlayers, playerId } from "../helpers/bigTables";

// Fournisseur fictif (aucun appel réseau). Chaque test remplace les méthodes utiles.
const PROVIDER = "testprov";
let provider = {};
const register = (methods) => { provider = { key: PROVIDER, ...methods }; registerProvider(provider); };

const COMPETITION = { id: "comp-1", name: "Pro League", provider: PROVIDER, external_id: "144", ext: {} };
const SEASON = { id: "season-2026", competition_id: "comp-1", label: "2026-2027" };
const CTX = { season: "2026-2027" };

const fixture = (id, home, away, extra = {}) => ({
  external_id: String(id), home_ext: String(home), away_ext: String(away), home_name: `Club ${home}`, away_name: `Club ${away}`,
  home_score: 1, away_score: 0, status: "finished", minute: 90, round: "Regular Season - 1", kickoff: "2026-08-01T18:00:00+00:00", ...extra,
});
const matchRow = (db, externalId) => db.rows("matches").find((row) => row.external_id === String(externalId));

beforeEach(() => register({}));

describe("syncCompetition au-delà de 1 000 clubs", () => {
  it("mode complet : relie les clubs situés après la 1 000e ligne (plus de « — »)", async () => {
    register({ async fetchMatches() { return [fixture(9001, 1150, 1199)]; } });
    const db = createFakeSupabase({ clubs: manyClubs(1200), competitions: [{ ...COMPETITION }], seasons: [{ ...SEASON }] });
    await syncCompetition(db, { ...COMPETITION }, { ...CTX, mode: "full" });

    expect(matchRow(db, 9001)).toMatchObject({ home_club_id: clubId(1150), away_club_id: clubId(1199), season_id: "season-2026" });
  });

  it("répare un match existant resté sans club grâce à l'identifiant stocké", async () => {
    register({ async fetchMatches() { return [fixture(9001, 1150, 1199)]; } });
    const db = createFakeSupabase({
      clubs: manyClubs(1200),
      competitions: [{ ...COMPETITION }],
      seasons: [{ ...SEASON }],
      matches: [{ id: "m-old", source: PROVIDER, external_id: "8000", competition_id: "comp-1", season_id: "season-2026", home_club_id: null, away_club_id: null, locked: false, ext: { home_ext: "1180", away_ext: "1181" } }],
    });
    await syncCompetition(db, { ...COMPETITION }, { ...CTX, mode: "full" });

    expect(matchRow(db, 8000)).toMatchObject({ home_club_id: clubId(1180), away_club_id: clubId(1181) });
  });

  it("mode live : relie les clubs connus au-delà de 1 000 et crée seulement les clubs manquants", async () => {
    register({ async fetchLiveMatches() { return [fixture(9100, 1190, 5000, { status: "live", minute: 30 })]; } });
    const db = createFakeSupabase({ clubs: manyClubs(1200), competitions: [{ ...COMPETITION }], seasons: [{ ...SEASON }] });
    await syncCompetition(db, { ...COMPETITION }, { ...CTX, mode: "live" });

    const created = db.rows("clubs").find((row) => row.external_id === "5000");
    expect(created).toBeTruthy();
    expect(db.rows("clubs").filter((row) => row.external_id === "1190")).toHaveLength(1);
    expect(matchRow(db, 9100)).toMatchObject({ home_club_id: clubId(1190), away_club_id: created.id, status: "live" });
  });
});

describe("syncEvents au-delà de 1 000 joueurs", () => {
  it("relie l'événement au bon joueur et au bon club", async () => {
    register({ async fetchEvents() { return [{ minute: 12, type: "goal", team_ext: "1150", player_ext: "1450", player_name: "Joueur 1450" }]; } });
    const db = createFakeSupabase({
      clubs: manyClubs(1200),
      players: manyPlayers(1500),
      seasons: [{ ...SEASON }],
      matches: [{ id: "m-1", source: PROVIDER, external_id: "9001", competition_id: "comp-1", season_id: "season-2026", status: "finished", kickoff: "2026-08-01T18:00:00+00:00", events_synced_at: null }],
    });
    await syncEvents(db, { ...COMPETITION }, CTX);

    const call = db.rpcCalls.find((entry) => entry.name === "replace_provider_match_events");
    expect(call.args.event_rows[0]).toMatchObject({ player_id: playerId(1450), club_id: clubId(1150) });
  });
});

describe("syncLineups au-delà de 1 000 joueurs", () => {
  const seedLineups = (extra = {}) => createFakeSupabase({
    clubs: manyClubs(1200),
    players: manyPlayers(1500),
    seasons: [{ ...SEASON }],
    matches: [{ id: "m-1", source: PROVIDER, external_id: "9001", competition_id: "comp-1", season_id: "season-2026", status: "finished", kickoff: "2026-08-01T18:00:00+00:00", player_stats_synced_at: null }],
    ...extra,
  });

  it("relie la performance au bon joueur et au bon club", async () => {
    register({ async fetchMatchPlayerStats() { return [{ team_ext: "1150", player_ext: "1450", player_name: "Joueur 1450", minutes: 90, rating: 7.4, starter: true, substitute: false }]; } });
    const db = seedLineups();
    await syncLineups(db, { ...COMPETITION }, CTX);

    const row = db.rows("match_player_stats").find((entry) => entry.player_external_id === "1450");
    expect(row).toMatchObject({ player_id: playerId(1450), club_id: clubId(1150), minutes: 90 });
    expect(db.rows("matches")[0].player_stats_synced_at).toBeTruthy();
  });

  it("un joueur ou club introuvable n'efface jamais un lien déjà enregistré", async () => {
    register({ async fetchMatchPlayerStats() { return [{ team_ext: "77777", player_ext: "99999", player_name: "Inconnu", minutes: 64 }]; } });
    const db = seedLineups({
      match_player_stats: [{ id: "mps-1", match_id: "m-1", source: PROVIDER, player_external_id: "99999", player_id: "keep-player", club_id: "keep-club", minutes: 10, locked: false }],
    });
    await syncLineups(db, { ...COMPETITION }, CTX);

    const row = db.rows("match_player_stats").find((entry) => entry.id === "mps-1");
    expect(row).toMatchObject({ player_id: "keep-player", club_id: "keep-club", minutes: 64 });
  });

  it("répare une convocation nationale dont le joueur est au-delà de la 1 000e ligne", async () => {
    register({ async fetchMatchPlayerStats() { return []; } });
    const national = { id: "nat-be", source: PROVIDER, external_id: "1", name: "Belgique", team_type: "national" };
    const db = seedLineups({
      clubs: [...manyClubs(1200).slice(1), national],
      match_player_stats: [{ id: "mps-nat", match_id: "m-1", competition_id: "comp-1", club_id: "nat-be", player_external_id: "1300", player_id: null, starter: true, locked: false }],
    });
    await syncLineups(db, { ...COMPETITION }, CTX);

    expect(db.rows("match_player_stats").find((entry) => entry.id === "mps-nat").player_id).toBe(playerId(1300));
    expect(db.rows("national_match_callups")[0]).toMatchObject({ match_id: "m-1", national_team_id: "nat-be", player_id: playerId(1300), status: "started" });
  });
});

describe("syncTransfers au-delà de 1 000 clubs", () => {
  it("rattache le joueur à son club d'arrivée connu au lieu de le détacher", async () => {
    register({
      async fetchTeamTransfers(club) {
        if (club.external_id !== "1") return [];
        return [{ player_external_id: "1", player_name: "Joueur 1", transfer_date: "2026-07-15", transfer_type: "€ 5M", from_club_external_id: "1", from_club_name: "Club 1", to_club_external_id: "1100", to_club_name: "Club 1100", ext: {} }];
      },
    });
    const db = createFakeSupabase({
      clubs: manyClubs(1200),
      players: [{ id: "p-1", source: PROVIDER, external_id: "1", name: "Joueur 1", club_id: clubId(1), locked: false }],
      seasons: [{ ...SEASON }],
      matches: [{ id: "m-1", source: PROVIDER, external_id: "9001", competition_id: "comp-1", season_id: "season-2026", home_club_id: clubId(1), away_club_id: clubId(2) }],
      player_team_seasons: [{ id: "pts-old", player_id: "p-1", club_id: clubId(1), season: "2026", season_start_year: 2026, active: true, locked: false, joined_at: null }],
    });
    await syncTransfers(db, { ...COMPETITION }, CTX);

    expect(db.rows("players").find((row) => row.id === "p-1").club_id).toBe(clubId(1100));
    expect(db.rows("player_transfers")[0]).toMatchObject({ from_club_id: clubId(1), to_club_id: clubId(1100), player_id: "p-1" });
    expect(db.rows("player_team_seasons").find((row) => row.id === "pts-old")).toMatchObject({ active: false, left_at: "2026-07-15" });
    expect(db.rows("player_team_seasons").find((row) => row.club_id === clubId(1100))).toMatchObject({ active: true, membership_type: "permanent" });
  });
});
