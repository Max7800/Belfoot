import { describe, expect, it } from "vitest";
import { rbfaCategoryForTeam, rbfaPublicSnapshot } from "@/lib/rbfaPublicSelection";

const senior = { source: "apifootball", external_id: "1" };
const u21 = { source: "apifootball", external_id: "8183" };
const players = Array.from({ length: 11 }, (_, i) => ({ sourceId: String(i + 1), name: `Joueur ${i}`, club: "Club" }));
const snapshot = { observedAt: "2026-11-18T12:00:00Z", players };

describe("liste RBFA publique", () => {
  it("ne confond pas les catégories ni les fournisseurs", () => {
    expect(rbfaCategoryForTeam(senior)).toBe("senior");
    expect(rbfaCategoryForTeam(u21)).toBe("u21");
    expect(rbfaCategoryForTeam({ source: "manual", external_id: "1" })).toBeNull();
    expect(rbfaCategoryForTeam({ source: "apifootball", external_id: "1777" })).toBe("women");
    expect(rbfaCategoryForTeam({ source: "apifootball", external_id: "17942" })).toBe("u17");
    expect(rbfaCategoryForTeam({ source: "apifootball", external_id: "22425" })).toBe("u18");
    expect(rbfaPublicSnapshot({ senior: snapshot }, u21)).toBeNull();
  });
  it("accepte une liste complète sans exiger une fiche joueur Belfoot", () => {
    expect(rbfaPublicSnapshot({ senior: snapshot }, senior)).toMatchObject({ category: "senior", players });
  });
  it("ne remplace pas la liste existante par un instantané invalide", () => {
    expect(rbfaPublicSnapshot({ senior: { ...snapshot, players: players.slice(0, 2) } }, senior)).toBeNull();
    expect(rbfaPublicSnapshot({ senior: { ...snapshot, players: [...players, players[0]] } }, senior)).toBeNull();
    expect(rbfaPublicSnapshot({ senior: { ...snapshot, observedAt: "" } }, senior)).toBeNull();
    expect(rbfaPublicSnapshot(null, senior)).toBeNull();
  });
});
