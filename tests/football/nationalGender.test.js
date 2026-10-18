import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { mapFixture } from "@/modules/football/apifootball";
import { registerProvider } from "@/modules/football/providers";
import { nationalIdentity, syncNationalTeam } from "@/modules/football/syncNationalTeam";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { rawFixture } from "../helpers/apiFootballFixtures";

describe("nationalIdentity — genre distinct de l'âge", () => {
  it("le genre ne se déduit plus de l'âge : U19 féminine = u19 + women", () => {
    expect(nationalIdentity({ nationalCategory: "u19", teamName: "Belgium U19 W" })).toEqual({ category: "u19", gender: "women" });
    expect(nationalIdentity({ nationalCategory: "u19", nationalGender: "women", teamName: "Belgium U19" })).toEqual({ category: "u19", gender: "women" });
  });
  it("U19 et U17 masculines restent masculines", () => {
    expect(nationalIdentity({ nationalCategory: "u19", teamName: "Belgium U19" })).toEqual({ category: "u19", gender: "men" });
    expect(nationalIdentity({ nationalCategory: "u17", teamName: "Belgium U17" })).toEqual({ category: "u17", gender: "men" });
  });
  it("équipe A féminine : représentation existante « women » conservée (Red Flames)", () => {
    expect(nationalIdentity({ nationalCategory: "women", teamName: "Belgium W" })).toEqual({ category: "women", gender: "women" });
    expect(nationalIdentity({ nationalCategory: "senior", nationalGender: "women", teamName: "Belgium" })).toEqual({ category: "women", gender: "women" });
    expect(nationalIdentity({ nationalCategory: "senior", teamName: "Belgium W" })).toEqual({ category: "women", gender: "women" });
  });
  it("équipe A masculine inchangée ; incohérence « women » + hommes corrigée en A", () => {
    expect(nationalIdentity({ nationalCategory: "senior", teamName: "Belgium" })).toEqual({ category: "senior", gender: "men" });
    expect(nationalIdentity({ nationalCategory: "women", nationalGender: "men", teamName: "Belgium" })).toEqual({ category: "senior", gender: "men" });
  });
  it("choix explicite prioritaire sur le nom ; valeur inconnue ignorée", () => {
    expect(nationalIdentity({ nationalCategory: "u21", nationalGender: "men", teamName: "Belgium U21 W" })).toEqual({ category: "u21", gender: "men" });
    expect(nationalIdentity({ nationalCategory: "u21", nationalGender: "autre", teamName: "Belgium U21" })).toEqual({ category: "u21", gender: "men" });
  });
  it("U15 et U16 acceptées ; catégorie inconnue → A (comportement existant)", () => {
    expect(nationalIdentity({ nationalCategory: "u16", teamName: "Belgium U16" }).category).toBe("u16");
    expect(nationalIdentity({ nationalCategory: "u15", teamName: "Belgium U15" }).category).toBe("u15");
    expect(nationalIdentity({ nationalCategory: "u14", teamName: "Belgium" })).toEqual({ category: "senior", gender: "men" });
  });
});

describe("syncNationalTeam — sélection féminine de jeunes enregistrée correctement", () => {
  let teamName;
  beforeEach(() => {
    teamName = "Belgium U19 W";
    registerProvider({
      key: "apifootball",
      async fetchClubById(id) { return { external_id: String(id), name: teamName, logo_url: null, city: null }; },
      async fetchNationalTeamMatches() {
        return [rawFixture({ id: 900001, date: "2026-09-10T16:00:00+00:00", season: 2026, leagueId: 891, leagueName: "UEFA U19 Championship - Qualification - Women", round: "Group Stage - 1", home: { id: 21271, name: "Belgium U19 W" }, away: { id: 21300, name: "Denmark U19 W" } })].map(mapFixture);
      },
      async fetchCurrentSquad() { return []; },
    });
  });

  it("la sélection et ses adversaires : u19 + women (plus jamais « hommes »)", async () => {
    const db = createFakeSupabase({});
    await syncNationalTeam(db, { teamExternalId: "21271", nationalCategory: "u19", season: "2026-2027" });
    const clubs = Object.fromEntries(db.rows("clubs").map((c) => [c.external_id, c]));
    expect(clubs["21271"]).toMatchObject({ team_type: "national", national_category: "u19", national_gender: "women", national_followed: true });
    expect(clubs["21300"]).toMatchObject({ team_type: "national", national_category: "u19", national_gender: "women", national_followed: false });
  });

  it("U19 masculine : u19 + men", async () => {
    teamName = "Belgium U19";
    const db = createFakeSupabase({});
    await syncNationalTeam(db, { teamExternalId: "10327", nationalCategory: "u19", season: "2026-2027" });
    expect(db.rows("clubs").find((c) => c.external_id === "10327")).toMatchObject({ national_category: "u19", national_gender: "men" });
  });
});

describe("chaîne d'appel — le genre est transmis jusqu'à la synchro", () => {
  const read = (file) => fs.readFileSync(file, "utf8");
  it("cron national-refresh, route admin, route jobs, runJob et job", () => {
    expect(read("app/api/cron/national-refresh/route.js")).toContain("nationalGender: team.national_gender || null,");
    expect(read("app/api/cron/national-refresh/route.js")).toContain(".select(\"id,external_id,name,national_category,national_gender,synced_at\")");
    expect(read("app/api/admin/run-job/route.js")).toContain("nationalGender: body.nationalGender || null,");
    expect(read("app/api/jobs/[key]/route.js")).toContain("teamExternalId, nationalCategory, nationalGender,");
    expect(read("lib/jobs.js")).toContain("nationalGender: ctx.nationalGender || null,");
    expect(read("modules/football/jobs/nationalTeam.js")).toContain("syncNationalTeam(db, { ...ctx, teamExternalId, nationalCategory, nationalGender })");
    expect(read("modules/football/syncNationalTeam.js")).toContain("nationalIdentity({ nationalCategory: ctx.nationalCategory, nationalGender: ctx.nationalGender, teamName: team.name })");
  });
  it("admin : genre choisi séparément, « Selon l'API » par défaut, envoyé à chaque lancement", () => {
    const panel = read("components/admin/panels.js");
    expect(panel).toContain("const nationalGenderParam = nationalGender === \"auto\" ? null : nationalGender;");
    expect((panel.match(/nationalGender: nationalGenderParam \}\)/g) || []).length).toBe(3);
    expect(panel).not.toContain("<option value=\"women\">Red Flames</option>");
  });
});
