import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { editorialFieldsAfterEdit, isEditorialField, providerIdentityPatch } from "@/lib/playerIdentity";
import { registerProvider } from "@/modules/football/providers";
import { syncNationalTeam } from "@/modules/football/syncNationalTeam";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const existing = (extra = {}) => ({ id: "p1", name: "J. Mokio", photo_url: "https://media.example/mokio-api.png", nationality: "Belgium", birth_date: "2008-01-01", ext: {}, ...extra });

describe("nom et photo corrigés à la main — règle d'identité", () => {
  it("champ éditorial : jamais remplacé par l'API", () => {
    const player = existing({ name: "Jorthy Mokio", ext: { editorial_fields: ["name"] } });
    const patch = providerIdentityPatch(player, { name: "J. Mokio", photo_url: "https://media.example/new.png" });
    expect(patch).not.toHaveProperty("name");
    expect(patch.photo_url).toBe("https://media.example/new.png"); // la photo, non corrigée, suit l'API
  });
  it("photo corrigée : conservée", () => {
    const patch = providerIdentityPatch(existing({ ext: { editorial_fields: ["photo_url"] } }), { name: "J. Mokio", photo_url: "https://media.example/new.png" });
    expect(patch).not.toHaveProperty("photo_url");
  });
  it("valeur API absente : n'efface jamais la valeur connue", () => {
    const patch = providerIdentityPatch(existing(), { name: "", photo_url: null });
    expect(patch).not.toHaveProperty("name");
    expect(patch).not.toHaveProperty("photo_url");
  });
  it("champ non éditorial : mis à jour normalement", () => {
    expect(providerIdentityPatch(existing(), { name: "Jorthy Mokio", photo_url: "https://media.example/new.png" })).toMatchObject({ name: "Jorthy Mokio", photo_url: "https://media.example/new.png" });
  });
  it("nouveau joueur : valeurs de l'API ; champ non fourni non ajouté (comportement existant)", () => {
    expect(providerIdentityPatch(null, { name: "Nouveau", photo_url: null, nationality: "Belgium" })).toEqual({ name: "Nouveau", photo_url: null, nationality: "Belgium", birth_date: null });
    expect(providerIdentityPatch(null, { nationality: "Belgium" })).toEqual({ nationality: "Belgium", birth_date: null });
  });
  it("nationalité et date de naissance : règles existantes inchangées", () => {
    const patch = providerIdentityPatch(existing({ nationality: "Belgium, Maroc", ext: { editorial_birth_date: true } }), { nationality: "Morocco", birth_date: "2007-05-05" });
    expect(patch).toEqual({});
  });
});

describe("marquage après une édition manuelle", () => {
  it("champ modifié et non vide : marqué éditorial", () => {
    const ext = editorialFieldsAfterEdit({ keep: 1 }, { name: "J. Mokio", photo_url: "a" }, { name: "Jorthy Mokio", photo_url: "a" });
    expect(ext).toEqual({ keep: 1, editorial_fields: ["name"] });
  });
  it("champ vidé : rendu aux synchronisations", () => {
    const ext = editorialFieldsAfterEdit({ editorial_fields: ["name", "photo_url"] }, { name: "X", photo_url: "a" }, { name: "X", photo_url: "" });
    expect(ext).toEqual({ editorial_fields: ["name"] });
    expect(editorialFieldsAfterEdit({ editorial_fields: ["name"] }, { name: "X" }, { name: "" })).toEqual({});
  });
  it("champ inchangé : marqueurs existants conservés, rien ajouté", () => {
    expect(editorialFieldsAfterEdit({ editorial_fields: ["photo_url"] }, { name: "X", photo_url: "a" }, { name: "X", photo_url: "a" })).toEqual({ editorial_fields: ["photo_url"] });
    expect(editorialFieldsAfterEdit(undefined, { name: "X" }, { name: "X" })).toEqual({});
  });
  it("isEditorialField lit les marqueurs", () => {
    expect(isEditorialField({ ext: { editorial_fields: ["name"] } }, "name")).toBe(true);
    expect(isEditorialField({ ext: {} }, "name")).toBe(false);
    expect(isEditorialField(null, "name")).toBe(false);
  });
});

describe("synchronisations — branchement", () => {
  const read = (file) => fs.readFileSync(file, "utf8").split(String.fromCharCode(13)).join("");
  it("effectifs, découverte et équipe test passent nom et photo par la règle", () => {
    for (const file of ["modules/football/syncSquads.js", "modules/football/discoverPlayers.js"]) {
      const source = read(file);
      expect(source).toContain("providerIdentityPatch(existing, { nationality: p.nationality, birth_date: p.birth_date, name: p.name, photo_url: p.photo_url })");
      expect(source).not.toMatch(/external_id: p\.external_id, name: p\.name/);
      expect(source).not.toMatch(/photo_url: p\.photo_url, (age|\.\.\.)/);
    }
    expect(read("modules/football/syncTeamTest.js")).toContain("providerIdentityPatch(existing, { nationality: player.nationality, birth_date: player.birth_date, name: player.name, photo_url: player.photo_url })");
  });
  it("administration : nom et photo des joueurs déclarés éditoriaux, marquage à l'enregistrement", () => {
    expect(read("config/football-admin.js")).toContain("editorialFields: [\"name\", \"photo_url\"],");
    expect(read("components/admin/EntityManager.js")).toContain("row.ext = editorialFieldsAfterEdit(row.ext ?? original.ext, original, row, spec.editorialFields);");
    expect(read("components/admin/EntityManager.js")).toContain("if (spec.editorialFields?.length && row.id) {");
  });
  it("synchro des sélections : le joueur existant est lu avec ses marqueurs (ext)", () => {
    // Le faux Supabase renvoie toujours la ligne complète : vérification sur le code.
    expect(read("modules/football/syncNationalTeam.js")).toContain(".select(\"id,locked,club_id,country,tracked,nationality,national_team_id,national_team_locked,ext\")");
  });
});

describe("syncNationalTeam — nom et photo corrigés conservés", () => {
  beforeEach(() => {
    registerProvider({
      key: "apifootball",
      async fetchClubById(id) { return { external_id: String(id), name: "Belgium U21", logo_url: null, city: null }; },
      async fetchNationalTeamMatches() { return []; },
      async fetchCurrentSquad() { return [{ external_id: "500", name: "J. Mokio", number: 10, position: "Midfielder", photo_url: "https://media.example/api.png", age: 18, ext: {} }]; },
    });
  });
  it("le nom corrigé reste, la photo non corrigée suit l'API", async () => {
    const db = createFakeSupabase({ players: [{ id: "p-mokio", source: "apifootball", external_id: "500", name: "Jorthy Mokio", photo_url: "https://media.example/old.png", nationality: "Belgium", locked: false, ext: { editorial_fields: ["name"] } }] });
    await syncNationalTeam(db, { teamExternalId: "8183", nationalCategory: "u21", nationalGender: "men", season: "2026-2027" });
    expect(db.rows("players").find((p) => p.id === "p-mokio")).toMatchObject({ name: "Jorthy Mokio", photo_url: "https://media.example/api.png" });
  });
  it("nouveau joueur : nom et photo de l'API", async () => {
    const db = createFakeSupabase({});
    await syncNationalTeam(db, { teamExternalId: "8183", nationalCategory: "u21", nationalGender: "men", season: "2026-2027" });
    expect(db.rows("players").find((p) => p.external_id === "500")).toMatchObject({ name: "J. Mokio", photo_url: "https://media.example/api.png" });
  });
});
