import { afterEach, describe, expect, it, vi } from "vitest";
import apifootball from "@/modules/football/apifootball";
import { decodeEntities, repairText } from "@/lib/mojibake";

// 28/10/2026 : 28 joueurs (« D. O&apos;Shea ») et 2 transferts (« M. N&apos;Diaye »)
// stockés avec une entité HTML venue d'API-Football.
afterEach(() => vi.unstubAllGlobals());

describe("entités HTML des noms reçus de l'API", () => {
  it("décodées ; texte sans entité inchangé ; mojibake toujours réparé", () => {
    expect(decodeEntities("D. O&apos;Shea")).toBe("D. O'Shea");
    expect(decodeEntities("Brighton &amp; Hove Albion")).toBe("Brighton & Hove Albion");
    expect(decodeEntities("R. M'Barki")).toBe("R. M'Barki");
    expect(decodeEntities("&nbsp;")).toBe("&nbsp;"); // entité inconnue : laissée
    expect(repairText("K. WÃ¤tjen O&apos;Hara")).toBe("K. Wätjen O'Hara");
  });
  it("lecture de l'API : le joueur arrive avec son vrai nom, tous les jobs l'écrivent ainsi", async () => {
    const body = { response: [{ player: { id: 7, name: "D. O&apos;Shea", nationality: "Republic of Ireland", photo: null, age: 27, birth: {} }, statistics: [] }], errors: [], paging: { total: 1 } };
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify(body) })));
    const [player] = await apifootball.fetchSquadPlayers({ external_id: "50" }, { apifootballKey: "test" });
    expect(player.name).toBe("D. O'Shea");
  });
});
