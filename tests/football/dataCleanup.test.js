import { afterEach, describe, expect, it, vi } from "vitest";
import { repairMojibake } from "@/lib/mojibake";
import { frenchNationName, frenchTeamName, isNationName } from "@/lib/frenchNations";
import { dedupeTransfers } from "@/lib/transferLabels";
import apifootball from "@/modules/football/apifootball";
import { registerProvider } from "@/modules/football/providers";
import { syncPlayerCareers } from "@/modules/football/syncPlayerCareers";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Constats de l'audit des données du 26-27/10/2026.
describe("noms mojibake réparés", () => {
  it("UTF-8 relu en Latin-1 (y compris octets de contrôle invisibles)", () => {
    expect(repairMojibake("M. CvetkoviÄ\u0087")).toBe("M. Cvetković");
    expect(repairMojibake("J. LÃ¤hteenmÃ¤ki")).toBe("J. Lähteenmäki");
    expect(repairMojibake("W. Å»oÅ\u0082neczko")).toBe("W. Żołneczko");
    expect(repairMojibake("A. DÄ\u0083ncuÈ\u0099")).toBe("A. Dăncuș");
  });
  it("nom mélangé : seule la séquence abîmée est réparée", () => {
    expect(repairMojibake("Ã\u0081lex Gómez")).toBe("Álex Gómez");
  });
  it("noms corrects et valeurs non textuelles inchangés", () => {
    for (const name of ["J. Åberg", "O. Ågren", "Éric Abidal", "Ç. Söyüncü", "Ñíguez", "Thibaut Courtois", ""]) expect(repairMojibake(name)).toBe(name);
    expect(repairMojibake("AÄ©©b")).toBe("AÄ©©b"); // octets invalides : laissés tels quels, jamais « � »
    expect(repairMojibake(null)).toBeNull();
    expect(repairMojibake(12)).toBe(12);
  });
  it("réponse de l'API réparée à la lecture : tous les jobs écrivent le bon nom", async () => {
    const body = { response: [{ player: { id: 7, name: "M. CvetkoviÄ\u0087", photo: "https://x/7.png" }, statistics: [] }], errors: [] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify(body) })));
    const players = await apifootball.fetchSquadPlayers({ external_id: "1" }, { apifootballKey: "test" });
    expect(players.map((player) => player.name)).toEqual(["M. Cvetković"]);
  });
  afterEach(() => vi.unstubAllGlobals());
});

describe("sélections reconnues au nom", () => {
  it("nom exact d'un pays, en anglais ou en français, catégorie d'âge permise", () => {
    expect(["Japan", "Brazil U17", "Belgique U21", "Côte d’Ivoire", "France"].map(isNationName)).toEqual([true, true, true, true, true]);
    expect(["Paris Saint Germain", "Japan FC", "Belgium W", "", null, "constructor", "toString"].map(isNationName)).toEqual([false, false, false, false, false, false, false]);
  });
  it("clés héritées de l'objet jamais prises pour un pays", () => {
    expect(frenchTeamName("constructor")).toBe("constructor");
    expect(frenchNationName("toString")).toBe("toString");
    expect(frenchNationName(" Italy ")).toBe("Italie");
  });
  it("historique de carrière sans indicateur « national » : sélection créée comme sélection, sans affectation", async () => {
    registerProvider({
      key: "testprov",
      async fetchPlayerCareer() {
        return [
          { team: { external_id: "194", name: "Ajax", logo_url: null, national: false }, season: "2026-2027", ext: {} },
          { team: { external_id: "12", name: "Japan", logo_url: null, national: false }, season: "2026-2027", ext: {} },
          { team: { external_id: "13", name: "Brazil U17", logo_url: null }, season: "2026-2027", ext: {} },
        ];
      },
    });
    const db = createFakeSupabase({
      clubs: [{ id: "club-ajax", source: "testprov", external_id: "194", name: "Ajax", team_type: "first_team", locked: false, ext: {} }],
      competitions: [{ id: "c-ere", name: "Eredivisie", provider: "testprov", external_id: "88", ext: { country: "Netherlands" } }],
      players: [{ id: "p-1", source: "testprov", external_id: "1", name: "Joueur", nationality: "Japan", career_sync_status: "pending", ext: {} }],
    });
    await syncPlayerCareers(db, { id: "c-ere", name: "Eredivisie", provider: "testprov" }, { playerId: "p-1" });
    const byExternal = Object.fromEntries(db.rows("clubs").map((row) => [row.external_id, row]));
    expect(byExternal["12"]).toMatchObject({ name: "Japon", team_type: "national", national_category: "senior" });
    expect(byExternal["13"]).toMatchObject({ name: "Brésil U17", team_type: "national", national_category: "u17" });
    expect(db.rows("player_team_seasons").map((row) => row.club_id)).toEqual(["club-ajax"]);
  });
});

describe("doublons de transferts", () => {
  const transfer = (id, date, extra = {}) => ({ id, player_id: "borys", from_club_id: "westerlo", to_club_id: "slask", transfer_date: date, ...extra });
  it("même joueur et mêmes clubs à quelques jours : un seul affiché (le plus ancien), ordre conservé", () => {
    const rows = [transfer("t3", "2026-09-08"), transfer("t2", "2026-09-07"), transfer("other", "2026-09-06", { player_id: "niang" })];
    expect(dedupeTransfers(rows).map((row) => row.id)).toEqual(["t2", "other"]);
  });
  it("même joueur, autre club de départ ou d’arrivée à quelques jours : gardés", () => {
    const rows = [transfer("a", "2026-09-01"), transfer("b", "2026-09-02", { to_club_id: "genk" }), transfer("c", "2026-09-03", { from_club_id: "genk" })];
    expect(dedupeTransfers(rows).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });
  it("aller-retour ou nouveau transfert des mois plus tard : gardés", () => {
    const rows = [transfer("a", "2026-01-10"), transfer("b", "2026-08-30"), transfer("back", "2026-09-01", { from_club_id: "slask", to_club_id: "westerlo" })];
    expect(dedupeTransfers(rows).map((row) => row.id)).toEqual(["a", "b", "back"]);
  });
  it("clubs inconnus de la base : comparés par nom ; date absente : gardé", () => {
    const rows = [
      { id: "x1", player_name: "A. Niang", from_club_name: "Genk", to_club_name: "Antwerp", transfer_date: "2026-09-02" },
      { id: "x2", player_name: "a. niang ", from_club_name: "genk", to_club_name: "ANTWERP", transfer_date: "2026-09-03" },
      { id: "x3", player_name: "A. Niang", from_club_name: "Genk", to_club_name: "Antwerp", transfer_date: null },
    ];
    expect(dedupeTransfers(rows).map((row) => row.id)).toEqual(["x1", "x3"]);
  });
});
