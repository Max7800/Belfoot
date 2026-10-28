import { describe, expect, it } from "vitest";
import { birthPlaceLabel, frenchPlaceName } from "@/lib/frenchPlaces";

// Lieux de naissance relevés le 28/10/2026 : néerlandais, anglais et allemand mêlés.
describe("lieux de naissance en français", () => {
  it("Bruxelles, Anvers, Gand… quelle que soit la langue de l'API", () => {
    expect(["Brussel", "Brussels", "Brüssel", "Bruxelles"].map(frenchPlaceName)).toEqual(Array(4).fill("Bruxelles"));
    expect(["Antwerpen", "Antwerp", "Gent", "Brugge", "Leuven", "Mechelen", "Kortrijk", "Sint-Truiden", "Ukkel", "Elsene", "Liege"].map(frenchPlaceName))
      .toEqual(["Anvers", "Anvers", "Gand", "Bruges", "Louvain", "Malines", "Courtrai", "Saint-Trond", "Uccle", "Ixelles", "Liège"]);
  });
  it("nom inconnu gardé tel quel (espaces retirés) ; vide et clés d'objet sans effet", () => {
    expect(frenchPlaceName(" Hasselt ")).toBe("Hasselt");
    expect(frenchPlaceName("toString")).toBe("toString");
    expect(frenchPlaceName(null)).toBeNull();
  });
  it("hors de Belgique : pays en français entre parenthèses", () => {
    expect(birthPlaceLabel({ place: "Antwerpen", country: "Belgium" })).toBe("Anvers");
    expect(birthPlaceLabel({ place: "Kinshasa", country: "Congo DR" })).toBe("Kinshasa (RD Congo)");
    expect(birthPlaceLabel({ place: "Baghdad", country: "Iraq" })).toBe("Bagdad (Irak)");
    expect(birthPlaceLabel({ country: "Haiti" })).toBe("Haïti");
    expect(birthPlaceLabel({ place: "Liège", country: "belgique" })).toBe("Liège");
    expect(birthPlaceLabel(null)).toBeNull();
  });
  it("pages : fiche joueur et page Belges passent par birthPlaceLabel", async () => {
    const fs = await import("node:fs");
    expect(fs.readFileSync("app/players/[id]/page.js", "utf8")).toContain("birthPlaceLabel(p.ext?.birth)");
    expect(fs.readFileSync("app/belges-a-l-etranger/page.js", "utf8")).toContain("birthPlaceLabel(item.player.birth || item.player.ext?.birth)");
  });
});
