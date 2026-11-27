import { beforeEach, describe, expect, it } from "vitest";
import fixtureCheck from "@/modules/football/jobs/fixtureCheck";
import { registerProvider } from "@/modules/football/providers";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { resolveJobScope } from "@/lib/jobScope";
import { JOB_CATALOG } from "@/lib/jobCatalog";
import { assertImportTargetAllowed } from "@/lib/importPlan";

const competition = { id: "c", name: "Ligue", provider: "apifootball", external_id: "5" };
const fixtures = [
  { external_id: "10", kickoff: "2026-10-01T18:00:00Z", home_name: "A", away_name: "B", round: "League A" },
  { external_id: "20", kickoff: "2027-03-25T19:45:00Z", home_name: "Belgique", away_name: "Allemagne", round: "Quarter-finals" },
];
const seed = () => ({ competitions: [competition], seasons: [{ id: "s", competition_id: "c", label: "2026-2027" }], matches: [{ id: "m", competition_id: "c", season_id: "s", source: "apifootball", external_id: "10" }] });

describe("diagnostic de matchs fournisseur", () => {
  let calls;
  beforeEach(() => {
    calls = [];
    registerProvider({ key: "apifootball", async fetchMatches(comp, ctx) { calls.push({ id: comp.external_id, season: ctx.season, attempts: ctx.providerAttempts }); return fixtures; } });
  });
  it("compare une saison et signale les matchs futurs absents sans écrire", async () => {
    const db = createFakeSupabase(seed());
    const before = JSON.stringify(["competitions", "seasons", "matches"].map((t) => db.rows(t)));
    const detail = await fixtureCheck.run({ db, competitionId: "c", season: "2026-2027", now: Date.parse("2026-11-23T00:00:00Z"), providerAttempts: 2 });
    expect(calls).toEqual([{ id: "5", season: "2026", attempts: 1 }]);
    expect(detail).toContain("1 identifiant(s) fournisseur non trouvés");
    expect(detail).toContain("2027-03-25 Belgique–Allemagne");
    expect(JSON.stringify(["competitions", "seasons", "matches"].map((t) => db.rows(t)))).toBe(before);
  });
  it("refuse une saison absente ou incohérente avant l'appel", async () => {
    const db = createFakeSupabase(seed());
    for (const season of [undefined, "2026-2028", "2026/2027", "2026-x"]) await expect(fixtureCheck.run({ db, competitionId: "c", season })).rejects.toThrow(/aucun appel API/);
    expect(calls).toEqual([]);
  });
  it("ne compte pas deux fois un identifiant fournisseur et signale les identifiants absents", async () => {
    registerProvider({ key: "apifootball", async fetchMatches() { return [fixtures[1], fixtures[1], { kickoff: "2027-03-26T19:00:00Z" }]; } });
    const detail = await fixtureCheck.run({ db: createFakeSupabase(seed()), competitionId: "c", season: "2026", now: Date.parse("2026-11-23T00:00:00Z") });
    expect(detail).toContain("1 identifiant(s) fournisseur non trouvés");
    expect(detail).toContain("1 identifiant(s) fournisseur en double");
    expect(detail).toContain("1 match(s) fournisseur sans identifiant");
  });
  it("n'appelle pas le fournisseur si la compétition est absente ou incompatible", async () => {
    const db = createFakeSupabase(seed());
    expect(await fixtureCheck.run({ db, competitionId: "inconnue", season: "2026" })).toContain("aucun appel API");
    db.rows("competitions")[0].provider = "autre";
    expect(await fixtureCheck.run({ db, competitionId: "c", season: "2026" })).toContain("aucun appel API");
    expect(calls).toEqual([]);
  });
  it("signale une saison manquante sans prétendre comparer les matchs", async () => {
    const db = createFakeSupabase(seed()); db.rows("seasons").splice(0);
    const detail = await fixtureCheck.run({ db, competitionId: "c", season: "2026" });
    expect(detail).toContain("comparaison impossible");
    expect(detail).not.toContain("non trouvés");
    expect(calls).toHaveLength(1);
  });
  it("refuse deux saisons correspondant à la même année avant l'appel", async () => {
    const db = createFakeSupabase(seed()); db.rows("seasons").push({ id: "s2", competition_id: "c", label: "2026" });
    await expect(fixtureCheck.run({ db, competitionId: "c", season: "2026" })).rejects.toThrow(/comparaison refusée/);
    expect(calls).toEqual([]);
  });
  it("lit tous les matchs au-delà de 1 000 lignes", async () => {
    const data = seed();
    data.matches = Array.from({ length: 1205 }, (_, i) => ({ id: `m${String(i).padStart(4,"0")}`, competition_id: "c", season_id: "s", source: "apifootball", external_id: String(i) }));
    const detail = await fixtureCheck.run({ db: createFakeSupabase(data), competitionId: "c", season: "2026" });
    expect(detail).toContain("1205 match(s), 0 identifiant(s) fournisseur non trouvés");
  });
  it("respecte le périmètre obligatoire et la garde d'import en lecture seule", async () => {
    expect(() => resolveJobScope("football.fixture-check", {})).toThrow(/périmètre manquant/);
    const db = createFakeSupabase({ site_settings: [{ id: 1, data: {} }] });
    await expect(assertImportTargetAllowed(db, "football.fixture-check", { competitionId: "c" }, JOB_CATALOG["football.fixture-check"])).resolves.toBeUndefined();
    await expect(assertImportTargetAllowed(db, "football.fixture-check", {}, JOB_CATALOG["football.fixture-check"])).rejects.toThrow(/Choisis une compétition/);
  });
});
