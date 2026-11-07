import { beforeEach, describe, expect, it } from "vitest";
import { scanBelgians, scanWrites, SCAN_LEAGUES, scanSeason } from "@/modules/football/scanBelgians";
import { registerProvider } from "@/modules/football/providers";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// 28/10/2026 : le balayage de l'Eredivisie a réécrit « Ajax » sur la fiche de
// M. Godts (1 match avant son transfert) alors que son affectation active de la saison est le PSG.
const S = "2026-2027";
const ere = (extra = {}) => ({ season: S, league: "Eredivisie", league_id: "88", club_id: "ajax", appearances: 1, ...extra });

describe("ce que le balayage peut écrire", () => {
  it("club : jamais par-dessus une affectation active d'un autre club ; sinon oui", () => {
    expect(scanWrites({ clubId: "ajax", seasonLabel: S, activeClubId: "psg" }).updateClub).toBe(false);
    expect(scanWrites({ clubId: "psg", seasonLabel: S, activeClubId: "psg" }).updateClub).toBe(true);
    expect(scanWrites({ clubId: "ajax", seasonLabel: S, activeClubId: null }).updateClub).toBe(true);
    // Sans club actif : le club suit les chiffres (pas l'Ajax si la Ligue 1 plus jouée est gardée).
    expect(scanWrites({ current: { ext: { league_stats: { season: S, club_id: "psg", appearances: 3 } } }, clubId: "ajax", stats: { appearances: 1 }, seasonLabel: S })).toEqual({ updateClub: false, updateStats: false });
  });
  it("chiffres : ceux du club actif ne sont jamais remplacés par un autre club ; ceux du club actif remplacent tout", () => {
    const onPsg = { ext: { league_stats: { season: S, league: "Ligue 1", club_id: "psg", appearances: 3 } } };
    expect(scanWrites({ current: onPsg, clubId: "ajax", stats: { appearances: 1 }, seasonLabel: S, activeClubId: "psg" }).updateStats).toBe(false);
    const onAjax = { ext: { league_stats: ere() } };
    expect(scanWrites({ current: onAjax, clubId: "psg", stats: { appearances: 3 }, seasonLabel: S, activeClubId: "psg" }).updateStats).toBe(true);
    // Aucun club tiers ne doit modifier les chiffres du club actif.
    expect(scanWrites({ current: onAjax, clubId: "az", stats: { appearances: 1 }, seasonLabel: S, activeClubId: "psg" }).updateStats).toBe(false);
    // Cas Cuypers : les chiffres existants viennent déjà de l'ancien club.
    expect(scanWrites({ current: onAjax, clubId: "ajax", stats: { appearances: 13 }, seasonLabel: S, activeClubId: "psg" })).toEqual({ updateClub: false, updateStats: false });
  });
  it("sans club actif, même saison : le championnat le plus joué reste ; nouvelle saison ou même club : remplacé", () => {
    const played = { ext: { league_stats: ere({ appearances: 15 }) } };
    expect(scanWrites({ current: played, clubId: "psg", stats: { appearances: 5 }, seasonLabel: S }).updateStats).toBe(false);
    expect(scanWrites({ current: played, clubId: "psg", stats: { appearances: 15 }, seasonLabel: S }).updateStats).toBe(true);
    expect(scanWrites({ current: { ext: { league_stats: ere({ season: "2025-2026", appearances: 30 }) } }, clubId: "psg", stats: { appearances: 1 }, seasonLabel: S }).updateStats).toBe(true);
    expect(scanWrites({ current: played, clubId: "ajax", stats: { appearances: 16 }, seasonLabel: S }).updateStats).toBe(true);
    expect(scanWrites({ current: null, clubId: "ajax", seasonLabel: S }).updateStats).toBe(true);
  });
});

describe("transfert vers le Mexique", () => {
  it("importe les chiffres du nouveau club et conserve ceux de l'ancien", async () => {
    const mexico = SCAN_LEAGUES.find((league) => league.id === "262");
    expect(mexico).toMatchObject({ name: "Liga MX", country: "Mexico" });
    expect(scanSeason(mexico, new Date("2026-11-07T12:00:00Z"))).toBe(2026);
    const chicagoStats = { season: S, league: "MLS", league_id: "253", club_id: "chicago", appearances: 11, goals: 13 };
    const db = createFakeSupabase({
      clubs: [{ id: "monterrey", source: "apifootball", external_id: "2282", name: "Monterrey", team_type: "first_team", locked: false, ext: {} }],
      players: [{ id: "cuypers", source: "apifootball", external_id: "27104", name: "H. Cuypers", nationality: "Belgium", club_id: "monterrey", locked: false, tracked: true, ext: { league_stats: chicagoStats } }],
      player_team_seasons: [{ player_id: "cuypers", club_id: "monterrey", season_start_year: 2026, active: true, locked: true }],
    });
    registerProvider({ key: "apifootball", async fetchLeaguePlayersPage() {
      return { pages: 1, players: [{ external_id: "27104", name: "H. Cuypers", nationality: "Belgium", team: { external_id: "2282", name: "Monterrey" }, stats: { appearances: 3, goals: 2 } }] };
    } });
    await scanBelgians(db, { leagues: [mexico], now: new Date("2026-11-07T12:00:00Z"), requestLimit: 1 });
    const player = db.rows("players")[0];
    expect(player).toMatchObject({ club_id: "monterrey", country: "Mexico", competition: "Liga MX" });
    expect(player.ext.league_stats).toMatchObject({ club_id: "monterrey", league_id: "262", appearances: 3, goals: 2 });
    expect(player.ext.league_stats_previous_clubs).toEqual([chicagoStats]);
    await scanBelgians(db, { leagues: [mexico], now: new Date("2026-11-07T12:00:00Z"), requestLimit: 1 });
    expect(db.rows("players")[0].ext.league_stats_previous_clubs).toEqual([chicagoStats]);
  });
});

describe("balayage réel : cas Godts", () => {
  beforeEach(() => {
    registerProvider({ key: "apifootball", async fetchLeaguePlayersPage() {
      return { pages: 1, players: [{ external_id: "7", name: "M. Godts", nationality: "Belgium", photo_url: null, age: 21, birth_date: "2005-06-07", birth_country: "Belgium", birth_place: "Leuven", position: "Attacker", team: { external_id: "194", name: "Ajax", logo_url: null }, stats: { appearances: 1, lineups: 0, minutes: 29, goals: 0, assists: 1, yellow: 0, red: 0, rating: 7.2 } }] };
    } });
  });
  const seed = (memberships) => createFakeSupabase({
    clubs: [{ id: "ajax", source: "apifootball", external_id: "194", name: "Ajax", team_type: "first_team", locked: false, ext: {} }, { id: "psg", source: "apifootball", external_id: "85", name: "Paris Saint Germain", team_type: "first_team", ext: {} }, { id: "bel", source: "apifootball", external_id: "1", name: "Belgique", team_type: "national", ext: {} }],
    players: [{ id: "p-7", source: "apifootball", external_id: "7", name: "M. Godts", nationality: "Belgium", club_id: "psg", competition: "Ligue 1", country: "France", locked: false, tracked: true, ext: { league_stats: { season: S, league: "Ligue 1", league_id: "61", club_id: "psg", appearances: 3 } } }],
    player_team_seasons: memberships,
  });
  const run = (db) => scanBelgians(db, { leagues: [{ id: "88", name: "Eredivisie", country: "Netherlands" }], now: new Date("2026-10-28T12:00:00Z"), requestLimit: 5 });
  it("affectation active au PSG : ni le club ni les chiffres de Ligue 1 ne sont remplacés par l'Ajax", async () => {
    const db = seed([{ player_id: "p-7", club_id: "psg", season_start_year: 2026, active: true }, { player_id: "p-7", club_id: "bel", season_start_year: 2026, active: true }]);
    await run(db);
    const godts = db.rows("players").find((row) => row.id === "p-7");
    expect(godts).toMatchObject({ club_id: "psg", competition: "Ligue 1", tracked: true });
    expect(godts.ext.league_stats).toMatchObject({ league: "Ligue 1", club_id: "psg", appearances: 3 });
  });
  it("seule affectation active = la sélection : écartée ; club et chiffres suivent le championnat le plus joué", async () => {
    const db = seed([{ player_id: "p-7", club_id: "bel", season_start_year: 2026, active: true }]);
    await run(db); // Ligue 1 : 3 matchs, Eredivisie : 1 → rien ne change
    expect(db.rows("players").find((row) => row.id === "p-7")).toMatchObject({ club_id: "psg", ext: { league_stats: { league: "Ligue 1" } } });
    db.rows("players").find((row) => row.id === "p-7").ext.league_stats.appearances = 0;
    await run(db); // Eredivisie plus jouée : club et chiffres passent ensemble à l'Ajax
    expect(db.rows("players").find((row) => row.id === "p-7")).toMatchObject({ club_id: "ajax", ext: { league_stats: { league: "Eredivisie", appearances: 1 } } });
  });
});

