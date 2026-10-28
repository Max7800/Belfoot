import { afterEach, describe, expect, it, vi } from "vitest";
import apifootball from "@/modules/football/apifootball";

// Balayage arrêté le 28/10/2026 à 21 h 23 sur « fetch failed » : connexion
// coupée avant toute réponse, jamais réessayée.
const ok = (body) => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify(body) });
const cut = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
const squad = { response: [{ player: { id: 1, name: "A. Joueur", nationality: "Belgium", photo: null, age: 20, birth: {} }, statistics: [] }], errors: [], paging: { total: 1 } };
afterEach(() => vi.unstubAllGlobals());

describe("API-Football — connexion coupée", () => {
  it("un « fetch failed » est réessayé une fois : la réponse suivante est utilisée", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(cut()).mockResolvedValueOnce(ok(squad));
    vi.stubGlobal("fetch", fetch);
    const players = await apifootball.fetchSquadPlayers({ external_id: "631" }, { apifootballKey: "test" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(players.map((player) => player.name)).toEqual(["A. Joueur"]);
  });
  it("deux coupures : erreur lisible avec le code réseau, pas plus de deux essais", async () => {
    const fetch = vi.fn().mockRejectedValue(cut());
    vi.stubGlobal("fetch", fetch);
    await expect(apifootball.fetchSquadPlayers({ external_id: "631" }, { apifootballKey: "test" })).rejects.toThrow("API-Football: connexion impossible (ECONNRESET)");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("autre erreur de programmation (TypeError différente) : pas de nouvel essai", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Invalid URL"));
    vi.stubGlobal("fetch", fetch);
    await expect(apifootball.fetchSquadPlayers({ external_id: "631" }, { apifootballKey: "test" })).rejects.toThrow("Invalid URL");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
