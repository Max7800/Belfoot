import { beforeEach, describe, expect, it } from "vitest";
import { hasBelgianLink, scanBelgians, scanSeason, SCAN_LEAGUES, SCAN_PAGES_PER_RUN } from "@/modules/football/scanBelgians";
import scanJob from "@/modules/football/jobs/scanBelgians";
import { registerProvider } from "@/modules/football/providers";
import { preflightJobs, requiredMigrationsForJob } from "@/lib/jobPreflight";
import { JOB_PIPELINES } from "@/lib/jobCatalog";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const NOW = new Date("2026-10-28T12:00:00Z");
const player = (id, extra = {}) => ({ external_id: id, name: `Joueur ${id}`, nationality: "Netherlands", photo_url: null, age: 22, birth_date: "2004-01-01", birth_country: "Netherlands", birth_place: "Utrecht", position: "Midfielder", team: { external_id: "194", name: "Ajax", logo_url: "ajax.png" }, league: { id: "88", name: "Eredivisie", country: "Netherlands", logo: "ere.png" }, stats: { appearances: 9, lineups: 8, minutes: 700, goals: 2, assists: 3, yellow: 1, red: 0, rating: 7.1 }, ...extra });
// Faux fournisseur : 2 pages d'Eredivisie ; l'identifiant « 999 » renvoie un autre pays.
const PAGES = {
  "88:1": [player("1", { nationality: "Belgium" }), player("2"), player("3", { nationality: "Morocco", birth_country: "Belgium", birth_place: "Genk" })],
  "88:2": [player("4", { nationality: "Belgium, Morocco", team: { external_id: "195", name: "Jong Ajax", logo_url: null } }), player("5", { nationality: "Belgium" })],
  "999:1": [player("9", { nationality: "Belgium", league: { id: "999", name: "Brasileirão", country: "Brazil" } })],
};
let calls = [];
beforeEach(() => {
  calls = [];
  registerProvider({ key: "apifootball", async fetchLeaguePlayersPage(leagueId, season, page) { calls.push(`${leagueId}:${season}:${page}`); return { players: PAGES[`${leagueId}:${page}`] || [], pages: leagueId === "88" ? 2 : 1 }; } });
});
const LEAGUES = [{ id: "999", name: "Faux", country: "Netherlands" }, { id: "88", name: "Eredivisie", country: "Netherlands" }];
const seed = () => createFakeSupabase({
  clubs: [{ id: "k-ajax", source: "apifootball", external_id: "194", name: "Ajax", team_type: "first_team", locked: false, ext: { city: "Amsterdam" } }],
  players: [
    { id: "p-1", source: "apifootball", external_id: "1", name: "Joueur 1", nationality: "Belgium, Ghana", locked: false, tracked: false, ext: { editorial_nationality: true, binational_watch: true } },
    { id: "p-5", source: "apifootball", external_id: "5", name: "Verrouillé", nationality: "Belgium", locked: true, tracked: false, ext: {} },
  ],
});

describe("balayage des championnats : qui garder", () => {
  it("nationalité belge (même parmi d'autres) ou né en Belgique", () => {
    expect([{ nationality: "Belgium" }, { nationality: "Belgium, Morocco" }, { nationality: "Morocco", birth_country: "Belgium" }, { nationality: "France", birth_country: "France" }, {}].map(hasBelgianLink)).toEqual([true, true, true, false, false]);
  });
  it("saison : bascule au 1er juillet, année civile pour la Scandinavie / MLS / Japon", () => {
    expect(scanSeason({ id: "88" }, NOW)).toBe(2026);
    expect(scanSeason({ id: "88" }, new Date("2027-03-01T00:00:00Z"))).toBe(2026);
    expect(scanSeason({ id: "103", calendar: true }, new Date("2027-03-01T00:00:00Z"))).toBe(2027);
    expect(SCAN_LEAGUES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(SCAN_LEAGUES.map((league) => league.id)).size).toBe(SCAN_LEAGUES.length);
  });
});

describe("balayage des championnats : écriture", () => {
  it("identifiant erroné écarté dès la 1re page ; Belges et nés en Belgique suivis avec club, championnat et chiffres", async () => {
    const db = seed();
    const checkpoints = [];
    const result = await scanBelgians(db, { leagues: LEAGUES, now: NOW, requestLimit: 50, saveCheckpoint: async (state) => checkpoints.push(state) });
    expect(calls).toEqual(["999:2026:1", "88:2026:1", "88:2026:2"]);
    expect(result).toMatchObject({ complete: true, progress: { current: 2, total: 2 } });
    expect(result.detail).toMatch(/Faux \(999\) écarté : pays API « Brazil »/);
    expect(result.detail).toContain("3 Belge(s) mis à jour dont 2 nouveau(x)"); // la fiche verrouillée n'est pas comptée
    expect(checkpoints.at(-1)).toEqual({ leagueIndex: 2, page: 1 });

    const byExternal = Object.fromEntries(db.rows("players").map((row) => [row.external_id, row]));
    expect(Object.keys(byExternal).sort()).toEqual(["1", "3", "4", "5"]); // ni le Néerlandais (2), ni le faux championnat (9)
    // Joueur existant : nationalité éditoriale et marqueurs conservés, suivi, club et championnat à jour.
    expect(byExternal["1"]).toMatchObject({ nationality: "Belgium, Ghana", tracked: true, active: true, club_id: "k-ajax", country: "Netherlands", competition: "Eredivisie" });
    expect(byExternal["1"].ext).toMatchObject({ editorial_nationality: true, binational_watch: true, birth: { country: "Netherlands", place: "Utrecht" }, league_stats: { season: "2026-2027", league: "Eredivisie", league_logo: "ere.png", goals: 2, assists: 3, appearances: 9, rating: 7.1 } });
    // Né à Genk, « Morocco » pour l'API : suivi.
    expect(byExternal["3"]).toMatchObject({ nationality: "Morocco", tracked: true, ext: { birth: { country: "Belgium", place: "Genk" } } });
    // Fiche verrouillée : jamais modifiée.
    expect(byExternal["5"]).toMatchObject({ name: "Verrouillé", tracked: false, ext: {} });
    // Clubs : pays et championnat national ajoutés ; club manquant créé.
    const clubs = Object.fromEntries(db.rows("clubs").map((row) => [row.external_id, row]));
    expect(clubs["194"].ext).toMatchObject({ city: "Amsterdam", country: "Netherlands", domestic_league: { id: "88", name: "Eredivisie", country: "Netherlands", logo: "ere.png" } });
    expect(clubs["195"]).toMatchObject({ name: "Jong Ajax", ext: { country: "Netherlands" } });
    // Nouveau joueur d'une équipe réserve : rattaché à cette équipe (Jong Ajax).
    expect(byExternal["4"].club_id).toBe(clubs["195"].id);
  });
  it("lot borné : au plus 8 pages (ou le budget), reprise au checkpoint", async () => {
    const db = seed();
    const first = await scanBelgians(db, { leagues: LEAGUES, now: NOW, requestLimit: 2 });
    expect(calls).toEqual(["999:2026:1", "88:2026:1"]);
    expect(first).toMatchObject({ complete: false, progress: { current: 1, total: 2 } });
    calls = [];
    const second = await scanBelgians(db, { leagues: LEAGUES, now: NOW, requestLimit: 50, resumeState: { leagueIndex: 1, page: 2 } });
    expect(calls).toEqual(["88:2026:2"]);
    expect(second.complete).toBe(true);
    expect(SCAN_PAGES_PER_RUN).toBe(8);
  });
  it("le job refuse de tourner hors du pipeline global", async () => {
    await expect(scanJob.run({ db: seed() })).rejects.toThrow(/pipeline « Balayer les championnats »/);
  });
});

describe("pipeline « Balayer les championnats »", () => {
  it("déclaré global, repris automatiquement, et accepté par le vrai préflight avec un budget de 1 500", async () => {
    const pipeline = JOB_PIPELINES.find((item) => item.key === "scan-leagues");
    expect(pipeline).toMatchObject({ jobs: ["football.scan-belgians"], drainJobs: ["football.scan-belgians"], globalScope: true });
    const result = await preflightJobs(createFakeSupabase({ schema_migrations: requiredMigrationsForJob("football.scan-belgians", "2026-2027") }), { pipelineKey: "scan-leagues", requestLimit: 1500 });
    expect(result.blockers).toEqual([]);
    expect(result.total.max).toBe(SCAN_PAGES_PER_RUN);
  });
});
