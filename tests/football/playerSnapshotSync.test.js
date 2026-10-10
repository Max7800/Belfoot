import { beforeEach, describe, expect, it } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import { syncSquads } from "@/modules/football/syncSquads";
import { discoverBelgians } from "@/modules/football/discoverPlayers";
import { syncTransfers } from "@/modules/football/syncTransfers";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Saison courante calculée comme les synchronisations (bascule au 1er juillet).
const NOW = new Date();
const YEAR = NOW.getUTCMonth() >= 6 ? NOW.getUTCFullYear() : NOW.getUTCFullYear() - 1;
const PROVIDER = "testprov";

// Compétitions telles qu'enregistrées en production.
const CONFERENCE = { id: "c-uecl", name: "Conférence League", provider: PROVIDER, external_id: "848", competition_scope: "europe", competition_type: "hybrid", ext: { country: "World", providerType: "Cup" } };
const EREDIVISIE = { id: "c-ere", name: "Eredivisie", provider: PROVIDER, external_id: "88", competition_scope: "etranger", competition_type: "league", ext: { country: "Netherlands" } };

// Réponses fictives de l'API (aucun appel réel).
const apiPlayer = (id, name, nationality) => ({ external_id: id, name, nationality, birth_date: null, position: "Midfielder", photo_url: null, age: 19, stats: { appearances: 6, lineups: 4, minutes: 400, goals: 1, assists: 1, yellow: 0, red: 0, rating: 7.1 } });
// Effectif par club ET par saison : Mokio n'a joué au PSV que la saison passée.
const squadFor = (clubExternalId, season) => {
  if (clubExternalId === "1") return [apiPlayer("396202", "Rayane Bounida", "Belgium"), apiPlayer("443829", "J. Mokio", "Belgium")];
  if (clubExternalId === "3" && Number(season) === YEAR - 1) return [apiPlayer("443829", "J. Mokio", "Belgium")];
  return [];
};
const CURRENT_SQUAD = { 1: [{ external_id: "396202", name: "Rayane Bounida", position: "Midfielder", ext: {} }, { external_id: "443829", name: "J. Mokio", position: "Defender", ext: {} }] };

function seedDb() {
  return createFakeSupabase({
    competitions: [{ ...CONFERENCE }, { ...EREDIVISIE }],
    clubs: [
      { id: "club-ajax", source: PROVIDER, external_id: "1", name: "Ajax", team_type: "first_team", locked: false, ext: { country: "Netherlands" } },
      { id: "club-opp", source: PROVIDER, external_id: "2", name: "Adversaire", team_type: "first_team", locked: false, ext: { country: "Poland" } },
      { id: "club-psv", source: PROVIDER, external_id: "3", name: "PSV", team_type: "first_team", locked: false, ext: { country: "Netherlands" } },
      { id: "nat-ma", source: PROVIDER, external_id: "31", name: "Maroc", team_type: "national", locked: false },
      { id: "nat-cd", source: PROVIDER, external_id: "32", name: "RD Congo", team_type: "national", locked: false },
    ],
    // Saison courante d'abord : l'ordre évite ici le défaut connu de résolution
    // par « includes » (chantier séparé « résolveur de saison exact »).
    seasons: [
      { id: "s-uecl", competition_id: "c-uecl", label: `${YEAR}-${YEAR + 1}` },
      { id: "s-ere", competition_id: "c-ere", label: `${YEAR}-${YEAR + 1}` },
      { id: "s-ere-old", competition_id: "c-ere", label: `${YEAR - 1}-${YEAR}` },
    ],
    matches: [
      { id: "m-uecl", source: PROVIDER, external_id: "1001", competition_id: "c-uecl", season_id: "s-uecl", home_club_id: "club-ajax", away_club_id: "club-opp" },
      { id: "m-ere", source: PROVIDER, external_id: "1002", competition_id: "c-ere", season_id: "s-ere", home_club_id: "club-ajax", away_club_id: "club-psv" },
      { id: "m-ere-old", source: PROVIDER, external_id: "1003", competition_id: "c-ere", season_id: "s-ere-old", home_club_id: "club-psv", away_club_id: "club-opp" },
    ],
    players: [
      // Valeurs correctes + choix éditoriaux (nationalités, sélection verrouillée).
      { id: "p-bounida", source: PROVIDER, external_id: "396202", name: "Rayane Bounida", nationality: "Belgium, Maroc", club_id: "club-ajax", country: "Netherlands", competition: "Eredivisie", national_team_id: "nat-ma", national_team_locked: true, tracked: true, active: true, locked: false, ext: { editorial_nationality: true } },
      // Déjà pollué par l'ancien code, comme en production.
      { id: "p-mokio", source: PROVIDER, external_id: "443829", name: "J. Mokio", nationality: "RD Congo, Belgium", club_id: "club-ajax", country: "World", competition: "Conférence League", national_team_id: "nat-cd", national_team_locked: true, tracked: true, active: true, locked: false, ext: { editorial_nationality: true } },
    ],
  });
}

const player = (db, id) => db.rows("players").find((row) => row.id === id);
const EDITORIAL = { "p-bounida": { nationality: "Belgium, Maroc", national_team_id: "nat-ma", national_team_locked: true }, "p-mokio": { nationality: "RD Congo, Belgium", national_team_id: "nat-cd", national_team_locked: true } };
const expectEditorialIntact = (db) => { for (const [id, values] of Object.entries(EDITORIAL)) expect(player(db, id)).toMatchObject(values); };

beforeEach(() => {
  registerProvider({
    key: PROVIDER,
    async fetchSquadPlayers(club, ctx) { return squadFor(club.external_id, ctx.season).map((row) => ({ ...row })); },
    async fetchCurrentSquad(club) { return (CURRENT_SQUAD[club.external_id] || []).map((row) => ({ ...row })); },
  });
});

describe("P0-3 — cron des coupes d'Europe", () => {
  it("la Conference League n'écrase plus le pays ni le championnat, même répétée", async () => {
    const db = seedDb();
    for (let run = 1; run <= 3; run++) {
      await syncSquads(db, { ...CONFERENCE }, { season: String(YEAR) });
      expect(player(db, "p-bounida")).toMatchObject({ club_id: "club-ajax", country: "Netherlands", competition: "Eredivisie" });
      // Mokio : « World » réparé par le pays de son club ; le nom de la coupe est retiré, rien n'est inventé.
      expect(player(db, "p-mokio")).toMatchObject({ club_id: "club-ajax", country: "Netherlands", competition: null });
      expectEditorialIntact(db);
    }
    // Historique conservé : une affectation par joueur et par club/saison, sans doublon.
    expect(db.rows("player_team_seasons").filter((row) => row.club_id === "club-ajax")).toHaveLength(2);
    expect(db.rows("players")).toHaveLength(2);
  });

  it("le championnat national de la saison courante rétablit le championnat, puis l'Europe ne le dégrade plus", async () => {
    const db = seedDb();
    await syncSquads(db, { ...CONFERENCE }, { season: String(YEAR) });
    await syncSquads(db, { ...EREDIVISIE }, { season: String(YEAR) });
    expect(player(db, "p-mokio")).toMatchObject({ club_id: "club-ajax", country: "Netherlands", competition: "Eredivisie" });
    await syncSquads(db, { ...CONFERENCE }, { season: String(YEAR) });
    expect(player(db, "p-mokio")).toMatchObject({ club_id: "club-ajax", country: "Netherlands", competition: "Eredivisie" });
    expectEditorialIntact(db);
  });

  it("une saison d'archive écrit l'historique sans toucher au club actuel", async () => {
    const db = seedDb();
    await syncSquads(db, { ...EREDIVISIE }, { season: String(YEAR - 1) });
    expect(player(db, "p-mokio")).toMatchObject({ club_id: "club-ajax" });
    expect(db.rows("player_team_seasons").find((row) => row.player_id === "p-mokio" && row.club_id === "club-psv")).toMatchObject({ season: String(YEAR - 1) });
  });

  it("la découverte des Belges sur une coupe d'Europe respecte la même règle", async () => {
    const db = seedDb();
    for (let run = 1; run <= 2; run++) await discoverBelgians(db, { ...CONFERENCE }, { season: String(YEAR) });
    expect(player(db, "p-bounida")).toMatchObject({ club_id: "club-ajax", country: "Netherlands", competition: "Eredivisie" });
    expect(player(db, "p-mokio")).toMatchObject({ country: "Netherlands", competition: null });
    expectEditorialIntact(db);
  });
});

describe("P0-3 — mercato d'archive", () => {
  it("un transfert d'une saison passée ne réécrit pas le club actuel", async () => {
    registerProvider({
      key: PROVIDER,
      async fetchTeamTransfers(club) {
        // Le mercato traite un club par lot : le club cédant est le premier traité.
        if (club.external_id !== "2") return [];
        return [{ player_external_id: "443829", player_name: "J. Mokio", transfer_date: `${YEAR - 1}-08-10`, transfer_type: "Loan", from_club_external_id: "2", from_club_name: "Adversaire", to_club_external_id: "3", to_club_name: "PSV", ext: {} }];
      },
    });
    const db = seedDb();
    await syncTransfers(db, { ...EREDIVISIE }, { season: String(YEAR - 1) });

    expect(player(db, "p-mokio").club_id).toBe("club-ajax");
    expect(db.rows("player_transfers")[0]).toMatchObject({ to_club_id: "club-psv", season_start_year: YEAR - 1 });
    expect(db.rows("player_team_seasons").find((row) => row.player_id === "p-mokio" && row.club_id === "club-psv")).toMatchObject({ membership_type: "loan" });
  });
});
