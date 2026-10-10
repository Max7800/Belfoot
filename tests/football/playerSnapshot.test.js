import { describe, expect, it } from "vitest";
import { clubNationalLeagues, isCurrentSeason, isNationalLeague, playerSnapshotPatch, resolvePlayerCountry, resolvePlayerLeague } from "@/lib/playerSnapshot";

// Compétitions telles qu'enregistrées en production (portée/type/pays relevés le 11/10).
const PRO_LEAGUE = { id: "c-jpl", name: "Pro League", competition_scope: "belgique", competition_type: "league", ext: { country: "Belgium" } };
const EREDIVISIE = { id: "c-ere", name: "Eredivisie", competition_scope: "etranger", competition_type: "league", ext: { country: "Netherlands" } };
const CONFERENCE = { id: "c-uecl", name: "Conférence League", competition_scope: "europe", competition_type: "hybrid", ext: { country: "World", providerType: "Cup" } };
const CROKY = { id: "c-croky", name: "Croky Cup", competition_scope: "belgique", competition_type: "cup", ext: { country: "Belgium" } };
// Compétition mondiale créée par les carrières avec une portée/type trompeurs.
const WORLD_CUP = { id: "c-wc", name: "World Cup", competition_scope: "etranger", competition_type: "league", ext: { country: "World" } };
const COMPETITIONS = Object.fromEntries([PRO_LEAGUE, EREDIVISIE, CONFERENCE, CROKY, WORLD_CUP].map((item) => [item.id, item]));

const AJAX = { id: "club-ajax", name: "Ajax", team_type: "first_team", ext: { country: "Netherlands" } };
const NOW = new Date("2026-10-11T12:00:00Z");
const CURRENT = "2026";
const ARCHIVE = "2025";

describe("isNationalLeague", () => {
  it("reconnaît les championnats nationaux", () => {
    expect(isNationalLeague(PRO_LEAGUE)).toBe(true);
    expect(isNationalLeague(EREDIVISIE)).toBe(true);
  });

  it("exclut coupes d'Europe, coupes nationales et compétitions mondiales mal typées", () => {
    expect(isNationalLeague(CONFERENCE)).toBe(false);
    expect(isNationalLeague(CROKY)).toBe(false);
    expect(isNationalLeague(WORLD_CUP)).toBe(false);
    expect(isNationalLeague({ name: "Sans pays", competition_type: "league", ext: {} })).toBe(false);
    expect(isNationalLeague({ name: "Coupe API", ext: { country: "France", providerType: "Cup" } })).toBe(false);
    expect(isNationalLeague(null)).toBe(false);
  });

  it("saison courante : bascule au 1er juillet", () => {
    expect(isCurrentSeason("2026", NOW)).toBe(true);
    expect(isCurrentSeason("2026-2027", NOW)).toBe(true);
    expect(isCurrentSeason("2025", NOW)).toBe(false);
    expect(isCurrentSeason("2025", new Date("2026-03-01T00:00:00Z"))).toBe(true);
    expect(isCurrentSeason(null, NOW)).toBe(false);
  });
});

describe("playerSnapshotPatch", () => {
  const patch = (existing, competition, extra = {}) => playerSnapshotPatch({ existing, club: AJAX, competition, season: CURRENT, now: NOW, ...extra });

  it("championnat national de la saison courante : fait autorité", () => {
    expect(patch({ club_id: "club-old", country: "Belgium", competition: "Pro League" }, EREDIVISIE))
      .toEqual({ club_id: "club-ajax", country: "Netherlands", competition: "Eredivisie" });
  });

  it("coupe d'Europe : n'écrase jamais des valeurs correctes (Bounida)", () => {
    expect(patch({ club_id: "club-ajax", country: "Netherlands", competition: "Eredivisie" }, CONFERENCE)).toEqual({});
  });

  it("coupe d'Europe : répare « World » par le pays du club et retire son propre nom (Mokio)", () => {
    expect(patch({ club_id: "club-ajax", country: "World", competition: "Conférence League" }, CONFERENCE))
      .toEqual({ country: "Netherlands", competition: null });
  });

  it("sans pays de club connu : ne fabrique aucun pays", () => {
    const club = { ...AJAX, ext: {} };
    expect(playerSnapshotPatch({ existing: { club_id: "club-ajax", country: "World", competition: "Conférence League" }, club, competition: CONFERENCE, season: CURRENT, now: NOW }))
      .toEqual({ competition: null });
  });

  it("coupe nationale, réserve ou saison d'archive : jamais d'écrasement du club actuel", () => {
    const existing = { club_id: "club-current", country: "Belgium", competition: "Pro League" };
    expect(patch(existing, CROKY)).toEqual({});
    expect(patch(existing, EREDIVISIE, { primaryClub: false })).toEqual({});
    expect(patch(existing, EREDIVISIE, { season: ARCHIVE })).toEqual({});
  });

  it("un autre club que le club actuel ne répare pas le pays", () => {
    expect(patch({ club_id: "club-autre", country: "World", competition: "X" }, CONFERENCE)).toEqual({});
  });

  it("nouveau joueur : remplit le club et le pays du club, championnat seulement s'il est national", () => {
    expect(patch(null, CONFERENCE)).toEqual({ club_id: "club-ajax", country: "Netherlands", competition: null });
    expect(patch(null, EREDIVISIE)).toEqual({ club_id: "club-ajax", country: "Netherlands", competition: "Eredivisie" });
  });

  it("répété : un second passage ne change plus rien", () => {
    const existing = { club_id: "club-ajax", country: "World", competition: "Conférence League" };
    const repaired = { ...existing, ...patch(existing, CONFERENCE) };
    expect(patch(repaired, CONFERENCE)).toEqual({});
  });
});

describe("resolvePlayerLeague / resolvePlayerCountry (affichage)", () => {
  const MOKIO_ROWS = [
    { player_id: "mokio", club_id: "club-ajax", competition_id: "c-uecl", season: "2026", appearances: 6 },
    { player_id: "mokio", club_id: "club-ajax", competition_id: "c-ere", season: "2026", appearances: 7 },
    { player_id: "mokio", club_id: "club-gent", competition_id: "c-jpl", season: "2024", appearances: 0 },
  ];
  const clubLeagues = clubNationalLeagues(MOKIO_ROWS, COMPETITIONS);

  it("Mokio : championnat national du club actuel d'après ses statistiques", () => {
    const player = { club_id: "club-ajax", country: "World", competition: "Conférence League" };
    const league = resolvePlayerLeague({ player, statRows: MOKIO_ROWS, competitionsById: COMPETITIONS, clubLeagues });
    expect(league.name).toBe("Eredivisie");
    expect(resolvePlayerCountry({ player, club: AJAX, league: league.competition })).toBe("Netherlands");
  });

  it("Bounida : sans statistiques, championnat connu de son club", () => {
    const player = { club_id: "club-ajax", country: "World", competition: "Conférence League" };
    expect(resolvePlayerLeague({ player, statRows: [], competitionsById: COMPETITIONS, clubLeagues }).name).toBe("Eredivisie");
  });

  it("instantané désignant une compétition non nationale : ignoré, rien n'est inventé", () => {
    const player = { club_id: "club-x", country: "World", competition: "Conférence League" };
    expect(resolvePlayerLeague({ player, statRows: [], competitionsById: COMPETITIONS, clubLeagues }).name).toBeNull();
    expect(resolvePlayerCountry({ player, club: { id: "club-x", ext: {} }, league: null })).toBeNull();
  });

  it("instantané inconnu des compétitions chargées : conservé", () => {
    const player = { club_id: "club-x", competition: "Ligue 1" };
    expect(resolvePlayerLeague({ player, statRows: [], competitionsById: COMPETITIONS, clubLeagues }).name).toBe("Ligue 1");
  });
});
