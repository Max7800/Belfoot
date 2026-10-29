import { describe, expect, it } from "vitest";
import { frenchClubName } from "@/lib/frenchClubs";
import { storedClubName, upsertExternal } from "@/modules/football/sync";
import { clubLabel } from "@/lib/transfersView";
import { createFakeSupabase } from "../helpers/fakeSupabase";

// Noms de clubs en français (30/10/2026) : « Standard Liege », « St. Truiden »…
describe("noms de clubs", () => {
  it("clubs belges et étrangers en usage francophone ; noms usuels inchangés", () => {
    expect(["Standard Liege", "St. Truiden", "Union St. Gilloise", "Club Brugge KV", "Gent", "KV Mechelen", "OH Leuven", "Kortrijk", "Paris Saint Germain", "Bayern München"].map(frenchClubName))
      .toEqual(["Standard de Liège", "Saint-Trond", "Union Saint-Gilloise", "Club Bruges", "La Gantoise", "KV Malines", "OH Louvain", "Courtrai", "Paris Saint-Germain", "Bayern Munich"]);
    expect(["Genk", "Anderlecht", "Ajax", "Celtic", " Antwerp "].map(frenchClubName)).toEqual(["Genk", "Anderlecht", "Ajax", "Celtic", "Antwerp"]);
    expect(frenchClubName("toString")).toBe("toString");
    expect(frenchClubName(null)).toBeNull();
  });
  it("à l'écriture : clubs en français, sélections toujours en français, autres tables inchangées", () => {
    expect(storedClubName("clubs", "Standard Liege")).toBe("Standard de Liège");
    expect(storedClubName("clubs", "Spain U21")).toBe("Espagne U21");
    expect(storedClubName("players", "Gent")).toBe("Gent");
  });
  it("synchronisation : l'API renvoie « Standard Liege » à chaque passage, la base garde « Standard de Liège »", async () => {
    const db = createFakeSupabase({ clubs: [{ id: "k-std", source: "apifootball", external_id: "733", name: "Standard de Liège", locked: false, ext: {} }] });
    await upsertExternal(db, "clubs", "apifootball", [{ external_id: "733", name: "Standard Liege", logo_url: "std.png" }, { external_id: "740", name: "St. Truiden", logo_url: null }], ["name", "logo_url"]);
    const byExternal = Object.fromEntries(db.rows("clubs").map((row) => [row.external_id, row.name]));
    expect(byExternal).toEqual({ 733: "Standard de Liège", 740: "Saint-Trond" });
  });
  it("transferts : noms bruts de l'API affichés en français", () => {
    expect(clubLabel("Standard Liege", "A. Calut")).toBe("Standard de Liège");
    expect(clubLabel("Tanghe Anton", "A. Tanghe")).toBeNull(); // club fantôme : toujours « Sans club »
  });
});
