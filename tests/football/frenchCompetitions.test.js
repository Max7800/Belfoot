import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { frenchCompetitionName } from "@/lib/frenchCompetitions";
import { competitionPath, resolveCompetitionRoute } from "@/lib/competitionRoutes";
import { isEuropeanClubCompetition } from "@/lib/competitionType";
import { isNationsLeagueCompetition } from "@/lib/nationsLeague";
import { defaultCompetitionEstimate } from "@/lib/importPlan";

// Noms et adresses de compétitions en français (30/10/2026).
describe("noms français", () => {
  it("grandes compétitions traduites", () => {
    expect(["Champion's league", "Europa League", "Conférence League", "UEFA Nations League", "UEFA U21 Championship - Qualification", "World Cup - Qualification Europe", "Friendlies Clubs"].map((name) => frenchCompetitionName(name)))
      .toEqual(["Ligue des champions", "Ligue Europa", "Ligue Conférence", "Ligue des nations", "Qualifications Euro U21", "Qualifications Coupe du monde (Europe)", "Matchs amicaux de clubs"]);
  });
  it("noms génériques et homonymes : pays en français, jamais pour la Belgique", () => {
    expect(frenchCompetitionName("Cup", "Greece")).toBe("Coupe (Grèce)");
    expect(frenchCompetitionName("Super Cup", "Netherlands")).toBe("Supercoupe (Pays-Bas)");
    expect(frenchCompetitionName("Pro League", "Saudi-Arabia")).toBe("Pro League (Arabie saoudite)");
    expect(frenchCompetitionName("Pro League", "United-Arab-Emirates")).toBe("Pro League (Émirats arabes unis)");
    expect(frenchCompetitionName("Pro League", "Belgium")).toBe("Pro League");
    expect(frenchCompetitionName("Bundesliga", "Austria")).toBe("Bundesliga (Autriche)");
    expect(frenchCompetitionName("Cup")).toBe("Coupe");
  });
  it("noms propres et inconnus gardés ; vide inchangé ; clé d'objet sans effet", () => {
    expect(frenchCompetitionName("DFB Pokal", "Germany")).toBe("DFB Pokal");
    expect(frenchCompetitionName("Eredivisie", "Netherlands")).toBe("Eredivisie");
    expect(frenchCompetitionName("toString")).toBe("toString");
    expect(frenchCompetitionName("")).toBe("");
  });
});

describe("adresses", () => {
  const ucl = { id: "u", name: "Ligue des champions", slug: "ligue-des-champions", public_visible: true, ext: { route_aliases: ["champion-s-league"] } };
  const pro = { id: "p", name: "Pro League", slug: "pro-league", public_visible: true, ext: { route_aliases: ["jupiler-pro-league"] } };
  const saudi = { id: "s", name: "Pro League", slug: null, public_visible: false, ext: {} };
  it("nouvelle adresse française, anciennes adresses toujours valables", () => {
    expect(competitionPath(ucl)).toBe("/competitions/ligue-des-champions");
    expect(resolveCompetitionRoute([ucl, pro], "champion-s-league")).toBe(ucl);
    expect(resolveCompetitionRoute([ucl, pro], "jupiler-pro-league")).toBe(pro);
    expect(resolveCompetitionRoute([ucl, pro], "ligue-des-champions")).toBe(ucl);
  });
  it("homonyme : la compétition visible passe avant la masquée (bug /competitions/pro-league)", () => {
    const hiddenFirst = [saudi, { ...pro, slug: null }];
    expect(resolveCompetitionRoute(hiddenFirst, "pro-league").id).toBe("p");
    expect(resolveCompetitionRoute([], "pro-league")).toBeNull();
  });
});

describe("détections par nom compatibles avec les noms français", () => {
  it("coupes d'Europe, Ligue des nations, estimation du plan d'import", () => {
    expect(isEuropeanClubCompetition({ name: "Ligue Conférence", competition_scope: "etranger" })).toBe(true);
    expect(isEuropeanClubCompetition({ name: "Ligue des champions" })).toBe(true);
    expect(isNationsLeagueCompetition({ name: "Ligue des nations", external_id: "999" })).toBe(true);
    expect(defaultCompetitionEstimate({ name: "Ligue des nations", external_id: "5" })).toEqual(defaultCompetitionEstimate({ name: "UEFA Nations League", external_id: "5" }));
    // Reconnue par son identifiant API, même si son nom change encore.
    expect(defaultCompetitionEstimate({ name: "Nom renommé", external_id: "5" })).toEqual(defaultCompetitionEstimate({ name: "UEFA Nations League", external_id: "5" }));
  });
  it("accueil : Pro League belge par identifiant ; « Conférence » avec accent reconnue", () => {
    const home = fs.readFileSync("app/page.js", "utf8");
    expect(home).toContain('data.competitions.find((competition) => String(competition.external_id || "") === "144")');
    expect(home).toContain("/(champions|europa|conf[ée]rence)/i");
  });
  it("création : nom français dès l'insertion", () => {
    expect(fs.readFileSync("modules/football/sync.js", "utf8")).toContain("name: frenchCompetitionName(d.name, d.ext?.country)");
  });
});
