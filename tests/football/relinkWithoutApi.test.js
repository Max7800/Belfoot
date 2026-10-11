import { describe, expect, it } from "vitest";
import { applyMatchClubLinks, applyPlayerStatLinks, relinkMatchClubs, relinkMatchPlayerStats } from "@/modules/football/relinkWithoutApi";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import { manyClubs, manyPlayers, playerId, clubId } from "../helpers/bigTables";

const P = "testprov";
const perf = (id, externalId, extra = {}) => ({ id, match_id: "m-1", competition_id: "c-1", source: P, player_external_id: externalId, player_id: null, locked: false, minutes: 90, ...extra });

function performancesDb() {
  return createFakeSupabase({
    // 1 200 joueurs : au-delà du plafond de 1 000 lignes qui a causé ces trous.
    players: [...manyPlayers(1200), { id: "dup-a", source: P, external_id: "5000" }, { id: "dup-b", source: P, external_id: "5000" }],
    match_player_stats: [
      perf("mps-01", "1150"),
      perf("mps-02", "1199", { competition_id: "c-2" }),
      perf("mps-03", "99999"),                         // aucune fiche
      perf("mps-04", "5000"),                          // deux fiches : ambiguë
      perf("mps-05", "1100", { locked: true }),        // verrouillée
      perf("mps-06", "1101", { player_id: "deja-relie" }), // déjà reliée
      perf("mps-07", "1102", { source: "autre" }),     // autre source : pas de fiche
    ],
  });
}
const row = (db, id) => db.rows("match_player_stats").find((item) => item.id === id);

describe("relinkMatchPlayerStats", () => {
  it("aperçu : compteurs exacts, rien n'est écrit", async () => {
    const db = performancesDb();
    const before = JSON.stringify(db.rows("match_player_stats"));
    const report = await relinkMatchPlayerStats(db);
    // La ligne verrouillée et la ligne déjà reliée ne sont même pas examinées.
    expect(report).toMatchObject({ scanned: 5, linkable: 2, linked: 0, unresolved: 2, ambiguous: 1, done: true });
    expect(report.links).toEqual([{ id: "mps-01", player_id: playerId(1150) }, { id: "mps-02", player_id: playerId(1199) }]);
    expect(JSON.stringify(db.rows("match_player_stats"))).toBe(before);
  });

  it("application : relie uniquement les cas sûrs, puis ne fait plus rien (idempotent)", async () => {
    const db = performancesDb();
    const first = await relinkMatchPlayerStats(db, { apply: true });
    expect(first.linked).toBe(2);
    expect(row(db, "mps-01").player_id).toBe(playerId(1150));
    expect(row(db, "mps-02").player_id).toBe(playerId(1199));
    for (const id of ["mps-03", "mps-04", "mps-05", "mps-07"]) expect(row(db, id).player_id).toBeNull();
    expect(row(db, "mps-06").player_id).toBe("deja-relie");

    const second = await relinkMatchPlayerStats(db, { apply: true });
    expect(second).toMatchObject({ linkable: 0, linked: 0 });
  });

  it("ne remplace jamais un lien posé entre l'aperçu et l'application", async () => {
    const db = performancesDb();
    const preview = await relinkMatchPlayerStats(db);
    row(db, "mps-01").player_id = "relie-par-ailleurs";
    const applied = await relinkMatchPlayerStats(db, { apply: true });
    expect(preview.linkable).toBe(2);
    expect(row(db, "mps-01").player_id).toBe("relie-par-ailleurs");
    expect(applied.links).toEqual([{ id: "mps-02", player_id: playerId(1199) }]);
  });

  it("filtre par compétition", async () => {
    const db = performancesDb();
    const report = await relinkMatchPlayerStats(db, { competitionId: "c-2", apply: true });
    expect(report.links).toEqual([{ id: "mps-02", player_id: playerId(1199) }]);
    expect(row(db, "mps-01").player_id).toBeNull();
  });

  it("curseur : les lignes non réparables en tête ne bloquent pas les lots suivants", async () => {
    const db = createFakeSupabase({
      players: manyPlayers(10),
      match_player_stats: [perf("a-1", "404"), perf("a-2", "405"), perf("a-3", "1"), perf("a-4", "406"), perf("a-5", "2")],
    });
    let afterId = null;
    let linked = 0;
    let batches = 0;
    for (;;) {
      const report = await relinkMatchPlayerStats(db, { apply: true, limit: 2, afterId });
      linked += report.linked;
      batches++;
      if (report.done) break;
      afterId = report.nextAfterId;
    }
    expect(linked).toBe(2);
    expect(batches).toBe(3);
    expect(db.rows("match_player_stats").filter((item) => item.player_id).map((item) => item.id)).toEqual(["a-3", "a-5"]);
  });

  it("retour arrière exact à partir des liens journalisés", async () => {
    const db = performancesDb();
    const original = JSON.stringify(db.rows("match_player_stats"));
    const { links } = await relinkMatchPlayerStats(db, { apply: true });
    // Procédure documentée : remettre à null les seules lignes du journal, si elles portent encore le lien posé.
    for (const link of links) await db.from("match_player_stats").update({ player_id: null }).eq("id", link.id).eq("player_id", link.player_id);
    expect(JSON.stringify(db.rows("match_player_stats"))).toBe(original);
  });
});

const COMPETITION = { id: "c-intl", name: "UEFA U21 Championship - Qualification", external_id: "666", provider: P, ext: { providerName: "Friendlies Women" } };
const match = (id, home, away, ext, extra = {}) => ({ id, competition_id: "c-intl", source: P, home_club_id: home, away_club_id: away, locked: false, ext, ...extra });

function matchesDb() {
  return createFakeSupabase({
    competitions: [{ ...COMPETITION }],
    clubs: [...manyClubs(1200), { id: "dup-1", source: P, external_id: "7000" }, { id: "dup-2", source: P, external_id: "7000" }],
    matches: [
      match("m-01", null, null, { home_ext: "1150", away_ext: "1199", league_ext: "666", league_name: "Friendlies Women" }),
      match("m-02", clubId(5), null, { home_ext: "5", away_ext: "99999", league_ext: "666", league_name: "Friendlies Women" }),
      match("m-03", null, clubId(6), { home_ext: "7000", away_ext: "6", league_ext: "850", league_name: "UEFA U21 Championship - Qualification" }),
      match("m-04", null, null, { league_ext: "666", league_name: "Friendlies Women" }),
      match("m-05", null, null, { home_ext: "1", away_ext: "2" }, { locked: true }),
      match("m-06", null, null, { home_ext: "3", away_ext: "4" }, { competition_id: "c-autre" }),
    ],
  });
}
const matchRow = (db, id) => db.rows("matches").find((item) => item.id === id);

describe("relinkMatchClubs", () => {
  it("exige une compétition explicite", async () => {
    await expect(relinkMatchClubs(matchesDb(), {})).rejects.toThrow("Choisis la compétition");
  });

  it("aperçu : compteurs, ligues API exposées pour repérer une compétition mal identifiée, rien n'est écrit", async () => {
    const db = matchesDb();
    const before = JSON.stringify(db.rows("matches"));
    const report = await relinkMatchClubs(db, { competitionId: "c-intl" });
    expect(report).toMatchObject({ scanned: 4, sidesEmpty: 6, linkable: 2, unresolved: 1, ambiguous: 1, noExternalId: 2, done: true });
    expect(report.competition).toEqual({ id: "c-intl", name: "UEFA U21 Championship - Qualification", externalId: "666", providerName: "Friendlies Women" });
    expect(report.providerLeagues).toEqual({ "666 Friendlies Women": 3, "850 UEFA U21 Championship - Qualification": 1 });
    expect(JSON.stringify(db.rows("matches"))).toBe(before);
  });

  it("application : remplit seulement les côtés vides et sûrs ; idempotent ; retour arrière exact", async () => {
    const db = matchesDb();
    const original = JSON.stringify(db.rows("matches"));
    const applied = await relinkMatchClubs(db, { competitionId: "c-intl", apply: true });
    expect(applied.links).toEqual(expect.arrayContaining([{ id: "m-01", side: "home", club_id: clubId(1150) }, { id: "m-01", side: "away", club_id: clubId(1199) }]));
    expect(applied.linked).toBe(2);
    expect(matchRow(db, "m-02")).toMatchObject({ home_club_id: clubId(5), away_club_id: null });
    expect(matchRow(db, "m-03").home_club_id).toBeNull();
    expect(matchRow(db, "m-05")).toMatchObject({ home_club_id: null, away_club_id: null });
    expect(matchRow(db, "m-06")).toMatchObject({ home_club_id: null, away_club_id: null });

    expect((await relinkMatchClubs(db, { competitionId: "c-intl", apply: true })).linked).toBe(0);

    for (const link of applied.links) await db.from("matches").update({ [`${link.side}_club_id`]: null }).eq("id", link.id).eq(`${link.side}_club_id`, link.club_id);
    expect(JSON.stringify(db.rows("matches"))).toBe(original);
  });
});

describe("plan journalisé puis application (parcours de la route admin)", () => {
  it("performances : seuls les liens du plan sont posés, un lien posé entre-temps est respecté", async () => {
    const db = performancesDb();
    const plan = (await relinkMatchPlayerStats(db)).links;
    row(db, "mps-02").player_id = "relie-par-ailleurs";
    const applied = await applyPlayerStatLinks(db, plan);
    expect(applied).toEqual([{ id: "mps-01", player_id: playerId(1150) }]);
    expect(row(db, "mps-02").player_id).toBe("relie-par-ailleurs");
    expect(await applyPlayerStatLinks(db, plan)).toEqual([]);
  });

  it("matchs : côté invalide refusé, plan appliqué une seule fois", async () => {
    const db = matchesDb();
    await expect(applyMatchClubLinks(db, [{ id: "m-01", side: "home; drop", club_id: "x" }])).rejects.toThrow("côté inconnu");
    const plan = (await relinkMatchClubs(db, { competitionId: "c-intl" })).links;
    expect((await applyMatchClubLinks(db, plan)).length).toBe(2);
    expect(await applyMatchClubLinks(db, plan)).toEqual([]);
  });
});
