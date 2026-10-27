import { afterEach, describe, expect, it, vi } from "vitest";
import apifootball from "@/modules/football/apifootball";
import { birthExtPatch, bornInBelgium } from "@/lib/playerIdentity";
import { registerProvider } from "@/modules/football/providers";
import { discoverBelgians } from "@/modules/football/discoverPlayers";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Audit du 27/10/2026 : seul l'âge était gardé ; le pays de naissance repère les
// joueurs nés en Belgique qui représentent un autre pays (Karetsas, El Khannouss).
describe("lieu de naissance", () => {
  it("ajouté à ext sans perdre les autres marqueurs ; valeur absente : rien n'est effacé", () => {
    const existing = { ext: { editorial_nationality: true, birth: { country: "Belgium", place: "Genk" } } };
    expect(birthExtPatch(existing, { birth_country: null, birth_place: "" })).toEqual({});
    expect(birthExtPatch(existing, { birth_country: "Belgium", birth_place: "Genk" })).toEqual({});
    expect(birthExtPatch({ ext: { editorial_nationality: true } }, { birth_country: " Belgium ", birth_place: "Genk" }))
      .toEqual({ ext: { editorial_nationality: true, birth: { country: "Belgium", place: "Genk" } } });
    expect(birthExtPatch(null, { birth_country: "Greece" })).toEqual({ ext: { birth: { country: "Greece" } } });
  });
  it("né en Belgique", () => {
    expect([{ ext: { birth: { country: "Belgium" } } }, { ext: { birth: { country: "Belgique" } } }, { ext: { birth: { country: "Greece" } } }, {}, null].map(bornInBelgium)).toEqual([true, true, false, false, false]);
  });
  it("découverte des Belges : pays et ville de naissance enregistrés, marqueurs existants conservés", async () => {
    registerProvider({ key: "testprov", async fetchSquadPlayers() { return [
      { external_id: "9", name: "B. El Khannouss", nationality: "Belgium", position: "Midfielder", birth_date: "2004-07-10", birth_country: "Belgium", birth_place: "Genk" },
      { external_id: "10", name: "Nouveau", nationality: "Belgium", position: "Defender", birth_country: "Belgium", birth_place: "Liège" },
    ]; } });
    const db = createFakeSupabase({
      competitions: [{ id: "c-1", name: "Bundesliga", provider: "testprov", external_id: "78", ext: { season: "2026" } }],
      seasons: [{ id: "s-1", competition_id: "c-1", label: "2026-2027" }],
      matches: [{ id: "m-1", competition_id: "c-1", season_id: "s-1", home_club_id: "k-1", away_club_id: "k-2" }],
      clubs: [{ id: "k-1", name: "VfB Stuttgart", external_id: "172", team_type: "first_team" }, { id: "k-2", name: "Autre", external_id: "173", team_type: "first_team" }],
      players: [{ id: "p-9", source: "testprov", external_id: "9", name: "B. El Khannouss", nationality: "Morocco, Belgium", locked: false, ext: { editorial_nationality: true } }],
    });
    await discoverBelgians(db, db.rows("competitions")[0], { season: "2026" });
    const byExternal = Object.fromEntries(db.rows("players").map((row) => [row.external_id, row]));
    expect(byExternal["9"].ext).toEqual({ editorial_nationality: true, birth: { country: "Belgium", place: "Genk" } });
    expect(byExternal["10"].ext).toEqual({ birth: { country: "Belgium", place: "Liège" } });
  });
  it("lecture de l'API : pays et ville de naissance gardés avec la date", async () => {
    const body = { response: [{ player: { id: 9, name: "K. Karetsas", nationality: "Greece", photo: null, age: 17, birth: { date: "2008-11-14", place: "Genk", country: "Belgium" } }, statistics: [] }], errors: [], paging: { total: 1 } };
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify(body) })));
    const [player] = await apifootball.fetchSquadPlayers({ external_id: "631" }, { apifootballKey: "test" });
    expect(player).toMatchObject({ nationality: "Greece", birth_date: "2008-11-14", birth_country: "Belgium", birth_place: "Genk" });
  });
  afterEach(() => vi.unstubAllGlobals());
});
