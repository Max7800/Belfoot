import { beforeEach, describe, expect, it } from "vitest";
import { CompetitionCollisionError, ensureCompetitions } from "@/modules/football/sync";
import { mapFixture } from "@/modules/football/apifootball";
import { registerProvider } from "@/modules/football/providers";
import { syncNationalTeam } from "@/modules/football/syncNationalTeam";
import { syncPlayerCareers } from "@/modules/football/syncPlayerCareers";
import { runJob } from "@/lib/jobs";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { rawFixture } from "../helpers/apiFootballFixtures";

const P = "apifootball";
// Index uniques réels de `competitions` (0001_init : (source, external_id) ; 0003 : slug).
const INDEXES = { uniqueIndexes: { competitions: [["source", "external_id"], ["slug"]] } };
const comp = (id, externalId, extra = {}) => ({ id, name: `Compétition ${externalId}`, source: P, provider: P, external_id: String(externalId), slug: null, locked: false, ...extra });
const def = (externalId, extra = {}) => ({ external_id: String(externalId), name: `Ligue ${externalId}`, slug: `international-${externalId}`, ...extra });
const snapshot = (db) => JSON.stringify(db.rows("competitions"));
// Migrations exigées par le préflight de football.national-team pour 2026-2027.
const JOB_MIGRATIONS = [["core", "0004_job_execution_guardrails"], ["football", "0028_followed_national_teams"], ["football", "0036_competition_scope"], ["football", "0038_player_national_team"], ["football", "0032_season_rollout"]].map(([module, version]) => ({ module, version }));

describe("ensureCompetitions — correspondances sûres", () => {
  it("crée une compétition absente (slug et identifiant libres)", async () => {
    const db = createFakeSupabase({ competitions: [] }, INDEXES);
    const map = await ensureCompetitions(db, P, [def(850)]);
    expect(db.rows("competitions")).toHaveLength(1);
    expect(map.get("850")).toMatchObject({ external_id: "850", slug: "international-850", source: P, provider: P, public_visible: false });
  });

  it("réutilise une fiche existante non ambiguë sans rien insérer", async () => {
    const db = createFakeSupabase({ competitions: [comp("c-850", 850, { slug: "international-850" })] }, INDEXES);
    const map = await ensureCompetitions(db, P, [def(850)]);
    expect(map.get("850").id).toBe("c-850");
    expect(db.rows("competitions")).toHaveLength(1);
  });

  it("réutilise une fiche dont `provider` est vide mais dont la source est ce provider (aucun doublon tenté)", async () => {
    const db = createFakeSupabase({ competitions: [comp("c-legacy", 307, { provider: null })] }, INDEXES);
    const map = await ensureCompetitions(db, P, [def(307, { slug: null })]);
    expect(map.get("307").id).toBe("c-legacy");
    expect(db.rows("competitions")).toHaveLength(1);
  });

  it("compétitions homonymes : chacune résolue par son identifiant, jamais par le nom", async () => {
    const db = createFakeSupabase({
      competitions: [
        comp("c-144", 144, { name: "Pro League", slug: "jupiler-pro-league" }),
        comp("c-307", 307, { name: "Pro League" }),
      ],
    }, INDEXES);
    const map = await ensureCompetitions(db, P, [
      { external_id: "144", name: "Pro League" },
      { external_id: "307", name: "Pro League" },
      { external_id: "301", name: "Pro League" },
    ]);
    expect(map.get("144").id).toBe("c-144");
    expect(map.get("307").id).toBe("c-307");
    expect(map.get("301")).toMatchObject({ name: "Pro League", external_id: "301" });
    expect(db.rows("competitions").filter((row) => row.name === "Pro League")).toHaveLength(3);
  });
});

describe("ensureCompetitions — collisions : arrêt explicite, aucune écriture", () => {
  it("collision de slug : la ligue 850 ne peut pas prendre le slug d'une fiche 666 (cas U21 réel)", async () => {
    const db = createFakeSupabase({ competitions: [comp("c-3e49", 666, { name: "UEFA U21 Championship - Qualification", slug: "international-850" })] }, INDEXES);
    const before = snapshot(db);
    const error = await ensureCompetitions(db, P, [def(850)]).catch((caught) => caught);
    expect(error).toBeInstanceOf(CompetitionCollisionError);
    expect(error.code).toBe("COMPETITION_COLLISION");
    expect(error.collisions).toEqual([expect.objectContaining({ externalId: "850", slug: "international-850", reason: expect.stringContaining("slug"), rows: [expect.objectContaining({ id: "c-3e49", external_id: "666" })] })]);
    expect(error.message).toContain("c-3e49");
    expect(snapshot(db)).toBe(before);
  });

  // État POSSIBLE malgré l'index (source, external_id) : les deux fiches ont des
  // sources différentes, mais toutes deux se déclarent pour apifootball.
  it("collision d'identifiant : fiche apifootball/apifootball et fiche d'une autre source déclarée apifootball", async () => {
    const db = createFakeSupabase({ competitions: [comp("c-a", 307), comp("c-b", 307, { source: "thesportsdb" })] }, INDEXES);
    const before = snapshot(db);
    const error = await ensureCompetitions(db, P, [def(307)]).catch((caught) => caught);
    expect(error).toBeInstanceOf(CompetitionCollisionError);
    expect(error.collisions[0]).toMatchObject({ externalId: "307", reason: expect.stringContaining("plusieurs fiches") });
    expect(error.collisions[0].rows.map((row) => `${row.id}:${row.source}/${row.provider}`).sort()).toEqual(["c-a:apifootball/apifootball", "c-b:thesportsdb/apifootball"]);
    expect(snapshot(db)).toBe(before);
  });

  it("fiche unique d'une autre source déclarée pour ce provider : réutilisée (comportement de main conservé)", async () => {
    const db = createFakeSupabase({ competitions: [comp("c-relinked", 850, { source: "thesportsdb", slug: "international-850" })] }, INDEXES);
    const map = await ensureCompetitions(db, P, [def(850)]);
    expect(map.get("850").id).toBe("c-relinked");
    expect(db.rows("competitions")).toHaveLength(1);
  });

  it("provider vide (\"\", valeur du formulaire admin vidé) : traité comme non renseigné, réutilisé si la source correspond", async () => {
    const db = createFakeSupabase({ competitions: [comp("c-blank", 850, { provider: "", slug: "international-850" })] }, INDEXES);
    const map = await ensureCompetitions(db, P, [def(850)]);
    expect(map.get("850").id).toBe("c-blank");
    expect(db.rows("competitions")).toHaveLength(1);
  });

  it("provider vide d'une AUTRE source : jamais réutilisé, et la ligue reste créable pour apifootball", async () => {
    const db = createFakeSupabase({ competitions: [comp("c-tsdb", 850, { source: "thesportsdb", provider: "" })] }, INDEXES);
    const map = await ensureCompetitions(db, P, [def(850)]);
    expect(map.get("850").id).not.toBe("c-tsdb");
    expect(map.get("850")).toMatchObject({ source: P, provider: P, external_id: "850" });
  });

  it("collision d'identifiant : la fiche de cette source est déclarée pour un autre provider", async () => {
    const db = createFakeSupabase({ competitions: [comp("c-other", 850, { provider: "thesportsdb" })] }, INDEXES);
    const before = snapshot(db);
    const error = await ensureCompetitions(db, P, [def(850)]).catch((caught) => caught);
    expect(error).toBeInstanceOf(CompetitionCollisionError);
    expect(error.collisions[0].reason).toContain("autre provider");
    expect(snapshot(db)).toBe(before);
  });

  it("une seule collision dans un lot bloque tout le lot : aucune autre création partielle", async () => {
    const db = createFakeSupabase({ competitions: [comp("c-3e49", 666, { slug: "international-850" })] }, INDEXES);
    const before = snapshot(db);
    await expect(ensureCompetitions(db, P, [def(10), def(850), def(5)])).rejects.toBeInstanceOf(CompetitionCollisionError);
    expect(snapshot(db)).toBe(before);
  });
});

// Course : une autre synchronisation écrit entre la lecture et l'insertion.
function withConcurrentInsert(db, row) {
  const from = db.from.bind(db);
  let done = false;
  db.from = (tableName) => {
    const builder = from(tableName);
    if (tableName !== "competitions") return builder;
    const insert = builder.insert.bind(builder);
    builder.insert = (payload) => {
      if (!done) { done = true; db.rows("competitions").push({ locked: false, ...row }); }
      return insert(payload);
    };
    return builder;
  };
  return db;
}

describe("ensureCompetitions — courses entre deux synchronisations", () => {
  it("la même ligue créée en parallèle est réutilisée, sans doublon ni erreur", async () => {
    const db = withConcurrentInsert(createFakeSupabase({ competitions: [] }, INDEXES), comp("c-concurrent", 850, { slug: "international-850" }));
    const map = await ensureCompetitions(db, P, [def(850)]);
    expect(map.get("850").id).toBe("c-concurrent");
    expect(db.rows("competitions")).toHaveLength(1);
  });

  it("le lot reste complet quand une seule ligue a été créée en parallèle", async () => {
    const db = withConcurrentInsert(createFakeSupabase({ competitions: [] }, INDEXES), comp("c-concurrent", 850, { slug: "international-850" }));
    const map = await ensureCompetitions(db, P, [def(850), def(5)]);
    expect(map.get("850").id).toBe("c-concurrent");
    expect(map.get("5")).toMatchObject({ external_id: "5", slug: "international-5" });
    expect(db.rows("competitions")).toHaveLength(2);
  });

  it("un slug pris en parallèle par une AUTRE ligue lève une collision explicite", async () => {
    const db = withConcurrentInsert(createFakeSupabase({ competitions: [] }, INDEXES), comp("c-intrus", 999, { slug: "international-850" }));
    const error = await ensureCompetitions(db, P, [def(850)]).catch((caught) => caught);
    expect(error).toBeInstanceOf(CompetitionCollisionError);
    expect(error.collisions[0]).toMatchObject({ externalId: "850", rows: [expect.objectContaining({ id: "c-intrus" })] });
    expect(db.rows("competitions").map((row) => row.id)).toEqual(["c-intrus"]);
  });

  it("second passage après une insertion partielle : aucun doublon, aucune mauvaise association", async () => {
    // Passage 1 : un intrus prend le slug de la 850 juste avant l'insertion du lot.
    // Le rattrapage crée la 5 (ligne valide) puis s'arrête sur la 850.
    const db = withConcurrentInsert(createFakeSupabase({ competitions: [] }, INDEXES), comp("c-intrus", 999, { slug: "international-850" }));
    await expect(ensureCompetitions(db, P, [def(5), def(850)])).rejects.toBeInstanceOf(CompetitionCollisionError);
    const created5 = db.rows("competitions").find((row) => row.external_id === "5");
    expect(created5).toMatchObject({ slug: "international-5", name: "Ligue 5", source: P, provider: P });
    expect(db.rows("competitions")).toHaveLength(2);

    // Passage 2 : la collision persiste ; la 5 est réutilisée, rien n'est recréé.
    const before = snapshot(db);
    await expect(ensureCompetitions(db, P, [def(5), def(850)])).rejects.toBeInstanceOf(CompetitionCollisionError);
    expect(snapshot(db)).toBe(before);

    // Passage 3 : collision levée par un humain ; la 5 reste LA même fiche, la 850 est créée.
    db.rows("competitions").splice(db.rows("competitions").findIndex((row) => row.id === "c-intrus"), 1);
    const map = await ensureCompetitions(db, P, [def(5), def(850)]);
    expect(map.get("5").id).toBe(created5.id);
    expect(map.get("850")).toMatchObject({ external_id: "850", slug: "international-850" });
    expect(db.rows("competitions").map((row) => row.external_id).sort()).toEqual(["5", "850"]);
  });

  it("une erreur d'insertion autre que l'unicité n'est jamais ignorée", async () => {
    const db = createFakeSupabase({ competitions: [] });
    const from = db.from.bind(db);
    db.from = (tableName) => {
      const builder = from(tableName);
      if (tableName === "competitions") builder.insert = () => Promise.resolve({ data: null, error: { code: "42501", message: "permission denied" } });
      return builder;
    };
    await expect(ensureCompetitions(db, P, [def(850)])).rejects.toThrow("permission denied");
  });
});

// ── Conséquences sur les appelants ────────────────────────────────────────────
const U21 = { id: 8183, name: "Belgium U21" };
let fixtures = [];
// Par joueur (external_id) : historique de carrière et statistiques de saison.
let careerHistory = {};
let careerSeason = {};

beforeEach(() => {
  fixtures = [];
  careerHistory = {};
  careerSeason = {};
  registerProvider({
    key: P,
    async fetchClubById(id) { return { external_id: String(id), name: U21.name, logo_url: null, city: null }; },
    async fetchNationalTeamMatches() { return fixtures.map(mapFixture); },
    async fetchCurrentSquad() { return [{ external_id: "900", name: "Joueur U21", number: 9, position: "Attacker", photo_url: null, age: 20, ext: {} }]; },
    async fetchPlayerCareer(player) { return careerHistory[player.external_id] || []; },
    async fetchPlayerCareerSeason(player) { return careerSeason[player.external_id] || []; },
  });
});

const u21Fixture = (id, leagueId, leagueName, season = 2025) => rawFixture({ id, date: "2026-11-14T18:00:00+00:00", season, leagueId, leagueName, round: "Group Stage - 26", home: U21, away: { id: 8200, name: "Austria U21" } });

describe("syncNationalTeam — collision propagée avant toute écriture", () => {
  it("état U21 d'avant correction : erreur explicite, aucun match, club, convocation ni compétition modifié", async () => {
    const db = createFakeSupabase({ competitions: [comp("c-3e49", 666, { name: "UEFA U21 Championship - Qualification", slug: "international-850", competition_type: "cup", competition_scope: "international" })] }, INDEXES);
    fixtures = [u21Fixture(1350300, 850, "UEFA U21 Championship - Qualification"), u21Fixture(1400001, 666, "Friendlies Women", 2026)];
    const before = snapshot(db);
    const error = await syncNationalTeam(db, { teamExternalId: "8183", nationalCategory: "u21", season: "2026-2027" }).catch((caught) => caught);
    expect(error).toBeInstanceOf(CompetitionCollisionError);
    expect(error.message).toContain("international-850");
    expect(db.rows("matches")).toHaveLength(0);
    expect(db.rows("clubs")).toHaveLength(0);
    expect(db.rows("national_team_callups")).toHaveLength(0);
    expect(db.rows("players")).toHaveLength(0);
    expect(snapshot(db)).toBe(before);
  });

  it("aucun match existant n'est réaffecté quand la synchronisation est arrêtée", async () => {
    const existing = { id: "m-1", source: P, external_id: "1350300", competition_id: "c-3e49", season_id: "s-1", locked: false, ext: {} };
    const db = createFakeSupabase({ competitions: [comp("c-3e49", 666, { slug: "international-850" })], matches: [existing] }, INDEXES);
    fixtures = [u21Fixture(1350300, 850, "UEFA U21 Championship - Qualification")];
    await expect(syncNationalTeam(db, { teamExternalId: "8183", nationalCategory: "u21", season: "2026-2027" })).rejects.toBeInstanceOf(CompetitionCollisionError);
    expect(db.rows("matches")).toEqual([existing]);
  });

  it("état corrigé : chaque ligue retrouve sa fiche, aucune fiche créée", async () => {
    const db = createFakeSupabase({
      competitions: [
        comp("c-3e49", 850, { slug: "international-850", competition_type: "cup", competition_scope: "international" }),
        comp("c-fem", 666, { slug: "international-666", competition_type: "cup", competition_scope: "international" }),
      ],
    }, INDEXES);
    fixtures = [u21Fixture(1350300, 850, "UEFA U21 Championship - Qualification"), u21Fixture(1400001, 666, "Friendlies Women", 2026)];
    await syncNationalTeam(db, { teamExternalId: "8183", nationalCategory: "u21", season: "2026-2027" });
    const competitionOf = (externalId) => db.rows("matches").find((row) => row.external_id === externalId)?.competition_id;
    expect(competitionOf("1350300")).toBe("c-3e49");
    expect(competitionOf("1400001")).toBe("c-fem");
    expect(db.rows("competitions")).toHaveLength(2);
  });

  it("nouvelle ligue sans conflit : créée normalement (non-régression)", async () => {
    const db = createFakeSupabase({ competitions: [] }, INDEXES);
    fixtures = [u21Fixture(1350300, 850, "UEFA U21 Championship - Qualification")];
    await syncNationalTeam(db, { teamExternalId: "8183", nationalCategory: "u21", season: "2026-2027" });
    expect(db.rows("competitions")).toEqual([expect.objectContaining({ external_id: "850", slug: "international-850", competition_scope: "international" })]);
    expect(db.rows("matches")).toHaveLength(1);
  });
});

describe("syncPlayerCareers — collision : écritures réelles, joueur en erreur, autres joueurs traités", () => {
  const team = (externalId) => ({ external_id: externalId, name: `Club ${externalId}`, logo_url: null, national: false, country: "Saudi-Arabia" });
  const seasonRow = (competitionExternalId, teamExternalId) => ({
    season: 2026,
    team: team(teamExternalId),
    competition: { external_id: competitionExternalId, name: "Pro League", logo_url: null, type: "League", country: "Saudi-Arabia", flag_url: null },
    player: { position: "Midfielder", nationality: "Belgium" },
    stats: { appearances: 10, goals: 2 },
    ext: {},
  });
  const historyRow = (teamExternalId) => ({ season: "2024", team: team(teamExternalId), ext: {} });
  const player = (id, externalId, extra = {}) => ({ id, name: `Joueur ${externalId}`, source: P, external_id: externalId, nationality: "Belgium", locked: false, ext: {}, ...extra });
  // État POSSIBLE malgré l'index (source, external_id) : deux fiches 307 de sources
  // différentes, toutes deux déclarées pour apifootball.
  const ambiguous307 = () => [comp("c-307a", 307, { name: "Pro League" }), comp("c-307b", 307, { name: "Pro League", source: "thesportsdb" })];
  const base = () => comp("c-144", 144, { name: "Pro League", slug: "jupiler-pro-league" });

  it("ciblé : historique et références de clubs écrits avant l'erreur, statistiques non écrites, message exact", async () => {
    const db = createFakeSupabase({ competitions: [base(), ...ambiguous307()], players: [player("p-1", "5000")] }, INDEXES);
    careerHistory = { 5000: [historyRow("2900")] };
    careerSeason = { 5000: [seasonRow("307", "2932"), seasonRow("301", "2940")] };
    const competitionsBefore = snapshot(db);
    const error = await syncPlayerCareers(db, base(), { playerId: "p-1", includeCareerStats: true, season: "2026-2027" }).catch((caught) => caught);
    expect(error.message).toContain("Joueur 5000: statistiques de saison non enregistrées (historique de carrière et clubs déjà mis à jour)");
    expect(error.message).toContain("Collision de compétitions");
    expect(error.message).not.toContain("sans écriture");
    // Écritures effectivement réalisées avant l'erreur, indépendantes de la compétition :
    expect(db.rows("clubs").map((club) => club.external_id).sort()).toEqual(["2900", "2932", "2940"]);
    const historyClub = db.rows("clubs").find((club) => club.external_id === "2900");
    expect(db.rows("player_team_seasons")).toEqual([expect.objectContaining({ player_id: "p-1", club_id: historyClub.id })]);
    // … et rien de ce qui dépend de la compétition :
    expect(db.rows("player_season_stats")).toHaveLength(0);
    expect(snapshot(db)).toBe(competitionsBefore);
    expect(db.rows("players")[0].career_sync_status).toBe("error");
  });

  it("groupé : le joueur en collision est en erreur, les autres sont traités ; le lot n'échoue pas mais signale la collision", async () => {
    const db = createFakeSupabase({
      competitions: [base(), ...ambiguous307()],
      clubs: [{ id: "club-home", source: P, external_id: "260", name: "Club 260", team_type: "first_team", locked: false }],
      matches: [{ id: "m-1", competition_id: "c-144", home_club_id: "club-home", away_club_id: null, source: P, external_id: "1" }],
      players: [
        player("p-a", "5001", { tracked: true, active: true, club_id: "club-home", career_synced_at: null }),
        player("p-b", "5002", { tracked: true, active: true, club_id: "club-home", career_synced_at: null }),
      ],
    }, INDEXES);
    careerSeason = { 5001: [seasonRow("307", "2932")], 5002: [seasonRow("301", "2940")] };
    // Le job groupé (jobs/playerCareers.js) force toujours includeCareerStats.
    const result = await syncPlayerCareers(db, base(), { batchSize: 5, includeCareerStats: true, season: "2026-2027" });
    const status = Object.fromEntries(db.rows("players").map((row) => [row.id, row.career_sync_status]));
    expect(status).toEqual({ "p-a": "error", "p-b": "ok" });
    const created301 = db.rows("competitions").find((row) => row.external_id === "301");
    expect(db.rows("player_season_stats")).toEqual([expect.objectContaining({ player_id: "p-b", competition_id: created301.id })]);
    expect(result.detail).toContain("1 erreur(s) dont 1 collision(s) de compétitions");
    expect(result.detail).toContain("Joueur 5001: statistiques de saison non enregistrées");
    // Choix assumé : une erreur individuelle ne fait pas échouer tout le lot
    // (comportement existant pour toutes les erreurs de joueur) ; elle reste visible
    // dans le détail du job et sur la fiche (career_sync_status = error).
    expect(result.complete).toBe(true);
  });

  it("homonymes non ambigus : chaque statistique va dans la bonne « Pro League » (non-régression)", async () => {
    const db = createFakeSupabase({ competitions: [base(), comp("c-307", 307, { name: "Pro League" })], players: [player("p-1", "5000")] }, INDEXES);
    careerSeason = { 5000: [seasonRow("307", "2932"), seasonRow("301", "2940")] };
    await syncPlayerCareers(db, base(), { playerId: "p-1", includeCareerStats: true, season: "2026-2027" });
    const created301 = db.rows("competitions").find((row) => row.external_id === "301");
    // Homonyme étranger : pays en français dans le nom (30/10/2026), plus de confusion avec la Pro League belge.
    expect(created301).toMatchObject({ name: "Pro League (Arabie saoudite)", provider: P });
    expect(db.rows("player_season_stats").map((row) => row.competition_id).sort()).toEqual(["c-307", created301.id].sort());
    expect(db.rows("players")[0].career_sync_status).toBe("ok");
  });
});

describe("runJob — enregistrement de la collision", () => {
  it("job_runs : statut error, message complet et code COMPETITION_COLLISION dans params", async () => {
    const db = createFakeSupabase({
      competitions: [comp("c-3e49", 666, { slug: "international-850", competition_scope: "international" })],
      schema_migrations: JOB_MIGRATIONS,
      site_settings: [{ id: 1, data: {} }],
    }, INDEXES);
    fixtures = [u21Fixture(1350300, 850, "UEFA U21 Championship - Qualification")];
    await expect(runJob("football.national-team", { db, teamExternalId: "8183", nationalCategory: "u21", season: "2026-2027", requestLimit: 5 })).rejects.toThrow("Collision de compétitions");
    expect(db.rows("job_runs")).toEqual([expect.objectContaining({
      job_key: "football.national-team",
      target_key: "team:8183",
      status: "error",
      detail: expect.stringContaining("ligue 850 (slug international-850)"),
      params: expect.objectContaining({ teamExternalId: "8183", error_code: "COMPETITION_COLLISION" }),
    })]);
    expect(db.rows("job_runs")[0].finished_at).toBeTruthy();
    expect(db.rows("matches")).toHaveLength(0);
  });

  it("une autre erreur n'est pas marquée comme collision", async () => {
    const db = createFakeSupabase({ schema_migrations: JOB_MIGRATIONS, site_settings: [{ id: 1, data: {} }] }, INDEXES);
    registerProvider({ key: P, async fetchClubById() { return null; }, async fetchNationalTeamMatches() { return []; }, async fetchCurrentSquad() { return []; } });
    await expect(runJob("football.national-team", { db, teamExternalId: "8183", nationalCategory: "u21", season: "2026-2027", requestLimit: 5 })).rejects.toThrow("introuvable");
    expect(db.rows("job_runs")[0]).toMatchObject({ status: "error" });
    expect(db.rows("job_runs")[0].params.error_code).toBeUndefined();
  });
});
