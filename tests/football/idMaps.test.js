import { describe, expect, it } from "vitest";
import { idMapByExternalIds, loadByExternalIds, selectAllPages } from "@/modules/football/sync";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { clubId, manyClubs } from "../helpers/bigTables";

describe("plafond Supabase (témoin)", () => {
  it("une lecture de toute la table est silencieusement tronquée à 1 000 lignes", async () => {
    const db = createFakeSupabase({ clubs: manyClubs(1500) });
    const { data, error } = await db.from("clubs").select("id,external_id").eq("source", "testprov");
    expect(error).toBeNull();
    expect(data).toHaveLength(1000);
    expect(data.some((row) => row.external_id === "1400")).toBe(false);
  });
});

describe("loadByExternalIds / idMapByExternalIds", () => {
  it("résout tous les identifiants demandés, même au-delà de 1 000 lignes", async () => {
    const db = createFakeSupabase({ clubs: manyClubs(1500) });
    const wanted = Array.from({ length: 1500 }, (_, i) => String(i + 1));
    const map = await idMapByExternalIds(db, "clubs", "testprov", wanted);
    expect(Object.keys(map)).toHaveLength(1500);
    expect(map["1400"]).toBe(clubId(1400));
    expect(map["1500"]).toBe(clubId(1500));
  });

  it("ignore les doublons, valeurs vides et identifiants numériques, et respecte la source", async () => {
    const db = createFakeSupabase({ clubs: [...manyClubs(3), { id: "other", source: "autre", external_id: "2" }] });
    const rows = await loadByExternalIds(db, "clubs", "testprov", [1, "1", null, undefined, "", "2", "999"]);
    expect([...rows.keys()].sort()).toEqual(["1", "2"]);
    expect(rows.get("2").id).toBe(clubId(2));
  });

  it("remonte une erreur de lecture au lieu de renvoyer une correspondance vide", async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: null, error: { message: "boom" } }) }) }) }) };
    await expect(loadByExternalIds(db, "clubs", "testprov", ["1"])).rejects.toThrow("clubs: boom");
  });
});

describe("selectAllPages", () => {
  it("lit toutes les lignes au-delà du plafond", async () => {
    const db = createFakeSupabase({ clubs: manyClubs(2500) });
    const rows = await selectAllPages(() => db.from("clubs").select("id").eq("source", "testprov").order("id"));
    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2500);
  });

  it("reste complet si le plafond serveur est inférieur à la taille de page", async () => {
    const db = createFakeSupabase({ clubs: manyClubs(2500) }, { maxRows: 300 });
    const rows = await selectAllPages(() => db.from("clubs").select("id").order("id"));
    expect(rows).toHaveLength(2500);
  });
});
