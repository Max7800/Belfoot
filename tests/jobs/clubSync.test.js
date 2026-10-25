import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { registerProvider } from "@/modules/football/providers";
import clubSyncJob from "@/modules/football/jobs/clubSync";
import { assertImportTargetAllowed } from "@/lib/importPlan";
import { JOB_CATALOG } from "@/lib/jobCatalog";
import { resolveJobScope } from "@/lib/jobScope";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const P = "apifootball";
const COMP = { id: "c-144", name: "Pro League", provider: P, source: P, external_id: "144", competition_type: "league", competition_scope: "belgique", ext: { season: "2026" } };
const clubs = [
  { id: "k-ano", source: P, external_id: "554", name: "Anderlecht", team_type: "first_team", locked: false, ext: {} },
  { id: "k-bru", source: P, external_id: "569", name: "Club Brugge", team_type: "first_team", locked: false, ext: {} },
];
const fixture = (id, home, away) => ({ external_id: String(id), home_ext: home, away_ext: away, home_name: home, away_name: away, home_score: 1, away_score: 0, status: "finished", minute: 90, round: "Regular Season - 1", kickoff: "2026-08-10T18:00:00Z" });
let calls;
beforeEach(() => {
  calls = [];
  registerProvider({
    key: P,
    async fetchMatches() { calls.push("fixtures"); return [fixture(1, "554", "569")]; },
    async fetchSquadPlayers(club) { calls.push(`squad:${club.external_id}`); return [{ external_id: `pl-${club.external_id}`, name: `Joueur ${club.external_id}`, position: "Midfielder", nationality: "Belgium", photo_url: null, age: 20, stats: {} }]; },
    async fetchCurrentSquad(club) { calls.push(`current:${club.external_id}`); return []; },
    async fetchCurrentCoach(club) { calls.push(`coach:${club.external_id}`); return { external_id: `co-${club.external_id}`, name: `Coach ${club.external_id}`, photo_url: null }; },
  });
});
const seed = () => createFakeSupabase({
  competitions: [{ ...COMP }],
  clubs: clubs.map((c) => ({ ...c })),
  seasons: [{ id: "s-26", competition_id: "c-144", label: "2026-2027", import_status: "active", public_active: true }],
  matches: [{ id: "m1", source: P, external_id: "1", competition_id: "c-144", season_id: "s-26", home_club_id: "k-ano", away_club_id: "k-bru", locked: false, ext: {} }],
});

describe("job football.club-sync", () => {
  it("matchs de la compétition, puis effectif et entraîneur du SEUL club choisi", async () => {
    const db = seed();
    const detail = await clubSyncJob.run({ db, competitionId: "c-144", clubId: "k-ano", season: "2026-2027" });
    expect(calls).toContain("fixtures");
    expect(calls.filter((c) => c.startsWith("squad:"))).toEqual(["squad:554"]);
    expect(calls.filter((c) => c.startsWith("coach:"))).toEqual(["coach:554"]);
    expect(calls.some((c) => c.endsWith(":569"))).toBe(false); // l'autre club n'est pas touché
    expect(detail).toMatch(/^Anderlecht \(2026-2027\) · matchs : .* · effectif : .* · entraîneur : /);
  });

  it("club absent de la compétition pour la saison : effectif et entraîneur non lancés", async () => {
    const db = seed();
    db.rows("clubs").push({ id: "k-gnk", source: P, external_id: "999", name: "Genk", team_type: "first_team", locked: false, ext: {} });
    const detail = await clubSyncJob.run({ db, competitionId: "c-144", clubId: "k-gnk", season: "2026-2027" });
    expect(calls.filter((c) => /^(squad|coach):/.test(c))).toEqual([]);
    expect(detail).toMatch(/effectif : Pro League: ce club ne joue pas cette saison/);
    expect(detail).toMatch(/entraîneur : Pro League: ce club ne joue pas cette saison/);
  });

  it("club manquant, inconnu, non relié au fournisseur ou sélection nationale : refus avant tout appel", async () => {
    await expect(clubSyncJob.run({ db: seed(), competitionId: "c-144" })).rejects.toThrow(/club manquant/);
    await expect(clubSyncJob.run({ db: seed(), competitionId: "c-144", clubId: "inconnu" })).rejects.toThrow(/Club introuvable/);
    const manual = seed(); manual.rows("clubs")[0].source = "manual";
    await expect(clubSyncJob.run({ db: manual, competitionId: "c-144", clubId: "k-ano" })).rejects.toThrow(/non relié/);
    const national = seed(); national.rows("clubs")[0].team_type = "national";
    await expect(clubSyncJob.run({ db: national, competitionId: "c-144", clubId: "k-ano" })).rejects.toThrow(/sélection nationale/);
    expect(calls).toEqual([]);
  });

  it("sans compétition : périmètre refusé", () => {
    expect(() => resolveJobScope("football.club-sync", { clubId: "k-ano" })).toThrow(/périmètre manquant/);
  });
});

describe("plan d'import — niveau « Archive enrichie » exigé", () => {
  const db = (scope) => createFakeSupabase({ site_settings: [{ id: 1, data: { football_import_plan: { version: 4, seasons: [{ label: "2026-2027", enabled: true }], competitions: { "c-144": { enabled: true, seasons: { "2026-2027": { enabled: true, scope } } } } } } }] });
  const entry = JOB_CATALOG["football.club-sync"];
  it("« Archive résultats » : refusé (effectifs non autorisés)", async () => {
    await expect(assertImportTargetAllowed(db("base"), "football.club-sync", { competitionId: "c-144", season: "2026-2027" }, entry)).rejects.toThrow(/n'autorise pas ce job/);
  });
  it("« Archive enrichie » ou « Saison complète » : autorisé", async () => {
    await expect(assertImportTargetAllowed(db("squads"), "football.club-sync", { competitionId: "c-144", season: "2026-2027" }, entry)).resolves.toBeUndefined();
    await expect(assertImportTargetAllowed(db("complete"), "football.club-sync", { competitionId: "c-144", season: "2026-2027" }, entry)).resolves.toBeUndefined();
  });
});

describe("branchement", () => {
  const read = (file) => fs.readFileSync(file, "utf8");
  it("route admin et journal transmettent le club ; fiche club : bouton avec préflight et confirmation", () => {
    expect(read("app/api/admin/run-job/route.js")).toContain("clubId: body.clubId || null,");
    expect(read("lib/jobs.js")).toContain("clubId: ctx.clubId || null,");
    const page = read("app/clubs/[id]/page.js");
    expect(page).toContain("const payload = { key: \"football.club-sync\", competitionId: competition.id, clubId: club.id, season, requestLimit: 10 };");
    expect(page).toMatch(/fetch\("\/api\/admin\/job-preflight"[\s\S]*window\.confirm\(`Synchroniser \$\{club\.name\}/);
    expect(page).toContain("onClick={syncThisClub}");
    expect(page).toContain("onClick={refreshClubCareers}"); // bouton existant conservé
  });
});
